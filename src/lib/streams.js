import { fetchJson, invidiousInstances, pipedInstances, reportInstance } from './instances'

/**
 * Ad-free playback source. Asks public Piped / Invidious instances for a
 * direct (proxied) media URL so the song can play in a plain <video>
 * element instead of YouTube's ad-carrying player.
 *
 * Instances are raced in small waves (healthiest first) so one slow or dead
 * server doesn't sink the song. `exclude` skips sources that already failed
 * for this track, so the player can retry elsewhere before giving up.
 *
 * Resolves to { url, hasVideo, base, meta: { title, author }, duration }.
 */

const cache = new Map()
const inflight = new Map()

const WAVE = 4
const MAX_WAVES = 4

export function resolveStream(id, { exclude = [], preferAudio = false } = {}) {
  const ck = `${id}|${preferAudio ? 'a' : 'v'}`
  const cached = cache.get(ck)
  if (cached && !exclude.includes(cached.base)) return Promise.resolve(cached)
  const key = `${ck}|${exclude.join(',')}`
  if (inflight.has(key)) return inflight.get(key)

  const promise = race(id, exclude, preferAudio).finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

/** Warm the cache for an upcoming track; failures are silent. */
export function prefetchStream(id, { preferAudio = false } = {}) {
  if (!id || cache.has(`${id}|${preferAudio ? 'a' : 'v'}`)) return
  resolveStream(id, { preferAudio }).catch(() => {})
}

export function forgetStream(id) {
  cache.delete(`${id}|a`)
  cache.delete(`${id}|v`)
}

async function race(id, exclude, preferAudio) {
  const piped = pipedInstances().filter((b) => !exclude.includes(b))
  const inv = invidiousInstances().filter((b) => !exclude.includes(b))
  // Interleave so each wave mixes both kinds of server.
  const attempts = []
  for (let i = 0; i < Math.max(piped.length, inv.length); i++) {
    if (piped[i]) attempts.push({ base: piped[i], run: () => fromPiped(piped[i], id, preferAudio) })
    if (inv[i]) attempts.push({ base: inv[i], run: () => fromInvidious(inv[i], id, preferAudio) })
  }

  for (let w = 0; w < MAX_WAVES && attempts.length; w++) {
    const wave = attempts.splice(0, WAVE)
    try {
      const result = await Promise.any(
        wave.map(({ base, run }) =>
          run().then(
            (r) => {
              if (!r?.url) throw new Error('empty')
              reportInstance(base, true)
              return { ...r, base }
            },
            (err) => {
              reportInstance(base, false)
              throw err
            },
          ),
        ),
      )
      const ck = `${id}|${preferAudio ? 'a' : 'v'}`
      cache.set(ck, result)
      setTimeout(() => cache.get(ck) === result && cache.delete(ck), 60 * 60 * 1000) // signed URLs expire
      return result
    } catch {
      // whole wave failed — next wave
    }
  }
  throw new Error('No ad-free source available')
}

const qualityOf = (label = '') => parseInt(label, 10) || 0

// preferAudio: phones get audio-only first — smaller, and keeps playing
// with the screen locked (iOS pauses <video> in the background).
async function fromPiped(base, id, preferAudio) {
  const data = await fetchJson(`${base}/streams/${id}`, 7000)
  const meta = { title: data.title, author: data.uploader }
  const audio = pickAudio((data.audioStreams || []).map((a) => ({ url: a.url, type: a.mimeType, bitrate: a.bitrate })))
  if (preferAudio && audio) return { url: audio.url, hasVideo: false, meta, duration: data.duration }

  // Prefer a single file with both picture and sound (usually 360p MP4).
  const muxed = (data.videoStreams || [])
    .filter((s) => s.url && !s.videoOnly && /mp4/i.test(`${s.mimeType} ${s.format}`))
    .sort((a, b) => qualityOf(b.quality) - qualityOf(a.quality))[0]
  if (muxed) return { url: muxed.url, hasVideo: true, meta, duration: data.duration }
  if (audio) return { url: audio.url, hasVideo: false, meta, duration: data.duration }
  return null
}

async function fromInvidious(base, id, preferAudio) {
  const data = await fetchJson(`${base}/api/v1/videos/${id}?local=true`, 7000)
  const meta = { title: data.title, author: data.author }
  const abs = (url) => (url?.startsWith('/') ? `${base}${url}` : url)
  const audio = pickAudio(
    (data.adaptiveFormats || []).map((f) => ({ url: abs(f.url), type: f.type, bitrate: Number(f.bitrate) || 0 })),
  )
  if (preferAudio && audio) return { url: audio.url, hasVideo: false, meta, duration: data.lengthSeconds }

  const muxed = (data.formatStreams || [])
    .filter((f) => f.url && /video\/mp4/i.test(f.type))
    .sort((a, b) => qualityOf(b.qualityLabel || b.resolution) - qualityOf(a.qualityLabel || a.resolution))[0]
  if (muxed) return { url: abs(muxed.url), hasVideo: true, meta, duration: data.lengthSeconds }
  if (audio) return { url: audio.url, hasVideo: false, meta, duration: data.lengthSeconds }
  return null
}

/** Best audio-only stream the browser can actually decode (AAC first for Safari). */
function pickAudio(list) {
  const probe = document.createElement('audio')
  return list
    .filter((a) => a.url && /^audio\//i.test(a.type || ''))
    .filter((a) => probe.canPlayType(a.type || '') !== '')
    .sort((a, b) => /mp4/i.test(b.type) - /mp4/i.test(a.type) || b.bitrate - a.bitrate)[0]
}
