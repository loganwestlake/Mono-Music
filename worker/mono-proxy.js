/**
 * Mono Music proxy — a free Cloudflare Worker.
 *
 * Why: public Piped / Invidious servers refuse requests that come from other
 * websites (browsers enforce this with CORS). A Worker isn't a browser, so it
 * can ask them on your behalf and hand the answer back to your site.
 *
 * What it does:
 *   GET /piped/<path>  → tries many Piped API servers until one answers
 *   GET /inv/<path>    → same for Invidious (stream URLs made absolute)
 *   GET /              → health check
 * Only the read-only endpoints Mono needs are allowed (streams, search,
 * playlists). Answers are cached for 10 minutes. No keys, no secrets.
 *
 * Deploy (free): dash.cloudflare.com → Workers & Pages → Create → Worker →
 * "Hello World" → Deploy → Edit code → replace everything with this file →
 * Deploy. Copy the https://….workers.dev address into Mono → Settings.
 */

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.drgns.space',
  'https://api.piped.yt',
  'https://pipedapi.reallyaweso.me',
]

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.f5.si',
  'https://inv.tux.pizza',
  'https://invidious.privacyredirect.com',
  'https://iv.melmac.space',
  'https://invidious.materialio.us',
]

const ALLOWED = {
  piped: /^\/(streams\/[\w-]{11}|search|playlists\/[\w-]+|nextpage\/playlists\/[\w-]+)$/,
  inv: /^\/api\/v1\/(videos\/[\w-]{11}|search|playlists\/[\w-]+)$/,
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400',
}

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS, ...extra } })

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
    if (request.method !== 'GET') return json({ error: 'GET only' }, 405)

    const url = new URL(request.url)
    const match = url.pathname.match(/^\/(piped|inv)(\/.*)$/)
    if (!match) return json({ name: 'mono-proxy', ok: true })

    const [, kind, path] = match
    if (!ALLOWED[kind].test(path)) return json({ error: 'Not allowed' }, 403)

    const cache = caches.default
    const cacheKey = new Request(url.toString())
    const hit = await cache.match(cacheKey)
    if (hit) return hit

    const bases = await instances(kind, ctx)
    const target = path + url.search

    // Race servers four at a time; first good answer wins.
    for (let i = 0; i < Math.min(bases.length, 20); i += 4) {
      try {
        const { base, data } = await Promise.any(
          bases.slice(i, i + 4).map((base) => getJson(base + target).then((data) => ({ base, data }))),
        )
        const body = kind === 'inv' ? absolutize(data, base) : data
        const res = json(body, 200, { 'cache-control': 'public, max-age=600' })
        ctx.waitUntil(cache.put(cacheKey, res.clone()))
        return res
      } catch {
        // whole batch failed — try the next one
      }
    }
    return json({ error: 'No server answered. Try again in a minute.' }, 502)
  },
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; mono-proxy)', accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(String(res.status))
  const data = await res.json()
  if (!data || data.error) throw new Error(data?.error || 'empty')
  if (Array.isArray(data.audioStreams) && !data.audioStreams.length && !(data.videoStreams || []).length) throw new Error('no streams')
  return data
}

/** Invidious "local" stream URLs are relative to the server that answered. */
function absolutize(data, base) {
  const fix = (list) => (list || []).map((f) => (f?.url?.startsWith('/') ? { ...f, url: base + f.url } : f))
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (data.formatStreams) data.formatStreams = fix(data.formatStreams)
    if (data.adaptiveFormats) data.adaptiveFormats = fix(data.adaptiveFormats)
  }
  return data
}

/** Built-in servers plus the live public directories (refreshed every 6h). */
async function instances(kind, ctx) {
  const cache = caches.default
  const key = new Request(`https://mono-proxy.internal/instances/${kind}`)
  const hit = await cache.match(key)
  if (hit) return hit.json()

  let found = []
  try {
    if (kind === 'piped') {
      const list = await getJson('https://piped-instances.kavin.rocks/')
      found = (Array.isArray(list) ? list : []).map((i) => i.api_url).filter((u) => /^https:\/\//.test(u || ''))
    } else {
      const list = await getJson('https://api.invidious.io/instances.json?sort_by=health')
      found = (Array.isArray(list) ? list : [])
        .filter(([, i]) => i?.api && i?.type === 'https' && i?.uri)
        .map(([, i]) => i.uri.replace(/\/$/, ''))
    }
  } catch {
    // directory unavailable — built-in list only
  }
  const all = [...new Set([...(kind === 'piped' ? PIPED : INVIDIOUS), ...found])]
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(all), { headers: { 'cache-control': 'public, max-age=21600' } })))
  return all
}
