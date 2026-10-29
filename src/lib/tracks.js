/**
 * Track helpers. A track is a plain object:
 *   { id: <YouTube video id>, title, artist, duration?: seconds, pending?: true }
 * `pending` marks tracks whose real title/artist will be filled in by the
 * player once YouTube reports them (e.g. a pasted link).
 */

export const thumbUrl = (id, quality = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${quality}.jpg`

const NOISE = [
  /\((official\s*)?(music\s*)?(video|audio|visualizer|lyric(s)?(\s*video)?|hd|4k|remaster(ed)?(\s*\d{4})?)\)/gi,
  /\[(official\s*)?(music\s*)?(video|audio|visualizer|lyric(s)?(\s*video)?|hd|4k|remaster(ed)?(\s*\d{4})?)\]/gi,
  /\bofficial\s+(music\s+)?(video|audio)\b/gi,
  /\|.*$/g,
]

export function cleanTitle(title) {
  let t = title
  NOISE.forEach((re) => (t = t.replace(re, '')))
  return t.replace(/\s{2,}/g, ' ').replace(/[\s\-–—]+$/, '').trim() || title
}

export function cleanChannel(channel = '') {
  return channel.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim()
}

/** "Artist - Title (Official Video)" → { artist, title }. */
export function parseVideoTitle(rawTitle = '', channel = '') {
  const title = cleanTitle(rawTitle)
  const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { artist: cleanChannel(channel) || 'Unknown artist', title }
}

/** Accepts any YouTube URL form (or a bare 11-char id) and returns the video id. */
export function extractVideoId(input = '') {
  const s = input.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  try {
    const url = new URL(s.startsWith('http') ? s : `https://${s}`)
    const host = url.hostname.replace(/^www\.|^m\.|^music\./, '')
    if (host === 'youtu.be') return url.pathname.slice(1, 12) || null
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = url.searchParams.get('v')
      if (v) return v.slice(0, 11)
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/)
      if (m) return m[2]
    }
  } catch {
    // not a URL
  }
  return null
}

export function formatTime(seconds = 0) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`
}

/** ISO-8601 duration (PT3M40S) → seconds. */
export function parseIsoDuration(iso = '') {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => Number(x) || 0)
  return d * 86400 + h * 3600 + min * 60 + s
}

export function shuffled(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
