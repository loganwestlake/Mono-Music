import { getJson, INVIDIOUS, PIPED } from './search'

/**
 * Ad-free playback source. Asks public Piped / Invidious instances for a
 * direct (proxied) media URL so the song can play in a plain <video>
 * element instead of YouTube's ad-carrying player.
 *
 * Resolves to { url, hasVideo, meta: { title, author }, duration }.
 * Throws if no instance answers; the player then falls back to YouTube.
 */

const cache = new Map()
let preferred = null

export async function resolveStream(id) {
  if (cache.has(id)) return cache.get(id)

  const all = [
    ...PIPED.map((base) => ({ base, run: () => fromPiped(base, id) })),
    ...INVIDIOUS.map((base) => ({ base, run: () => fromInvidious(base, id) })),
  ]
  const attempts = [...all.filter((a) => a.base === preferred), ...all.filter((a) => a.base !== preferred)]

  for (const attempt of attempts) {
    try {
      const result = await attempt.run()
      if (result?.url) {
        preferred = attempt.base
        cache.set(id, result)
        // Signed media URLs expire after a few hours.
        setTimeout(() => cache.delete(id), 60 * 60 * 1000)
        return result
      }
    } catch {
      // try the next instance
    }
  }
  throw new Error('No ad-free source available')
}

export function forgetStream(id) {
  cache.delete(id)
}

const qualityOf = (label = '') => parseInt(label, 10) || 0

async function fromPiped(base, id) {
  const data = await getJson(`${base}/streams/${id}`, 8000)
  const meta = { title: data.title, author: data.uploader }

  // Prefer a single file with both picture and sound (usually 360p MP4).
  const muxed = (data.videoStreams || [])
    .filter((s) => s.url && !s.videoOnly && /mp4/i.test(`${s.mimeType} ${s.format}`))
    .sort((a, b) => qualityOf(b.quality) - qualityOf(a.quality))[0]
  if (muxed) return { url: muxed.url, hasVideo: true, meta, duration: data.duration }

  const audio = pickAudio((data.audioStreams || []).map((a) => ({ url: a.url, type: a.mimeType, bitrate: a.bitrate })))
  if (audio) return { url: audio.url, hasVideo: false, meta, duration: data.duration }
  return null
}

async function fromInvidious(base, id) {
  const data = await getJson(`${base}/api/v1/videos/${id}?local=true`, 8000)
  const meta = { title: data.title, author: data.author }
  const abs = (url) => (url?.startsWith('/') ? `${base}${url}` : url)

  const muxed = (data.formatStreams || [])
    .filter((f) => f.url && /video\/mp4/i.test(f.type))
    .sort((a, b) => qualityOf(b.qualityLabel || b.resolution) - qualityOf(a.qualityLabel || a.resolution))[0]
  if (muxed) return { url: abs(muxed.url), hasVideo: true, meta, duration: data.lengthSeconds }

  const audio = pickAudio(
    (data.adaptiveFormats || []).map((f) => ({ url: abs(f.url), type: f.type, bitrate: Number(f.bitrate) || 0 })),
  )
  if (audio) return { url: audio.url, hasVideo: false, meta, duration: data.lengthSeconds }
  return null
}

/** Best audio-only stream the browser can actually decode (AAC first for Safari). */
function pickAudio(list) {
  const probe = document.createElement('audio')
  return list
    .filter((a) => a.url && /^audio\//i.test(a.type || ''))
    .filter((a) => probe.canPlayType(a.type || '') !== '')
    .sort((a, b) => (/mp4/i.test(b.type) - /mp4/i.test(a.type)) || b.bitrate - a.bitrate)[0]
}
