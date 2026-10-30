/**
 * Public Piped / Invidious instances. These are community servers that come
 * and go, so besides a built-in list we discover live ones from the official
 * directories, remember which ones answer, and try the healthiest first.
 */

const STATIC_PIPED = [
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

const STATIC_INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.f5.si',
  'https://inv.tux.pizza',
  'https://invidious.privacyredirect.com',
  'https://iv.melmac.space',
  'https://invidious.materialio.us',
]

const HEALTH_KEY = 'mono:v1:instance-health'
const DEAD_KEY = 'mono:v1:instance-dead'
const DIRECTORY_KEY = 'mono:v1:instance-directory'
const DIRECTORY_TTL = 6 * 60 * 60 * 1000
const DEAD_FOR = 12 * 60 * 60 * 1000

let health = readJson(HEALTH_KEY, {}) // base → score (successes − failures, decayed)
let dead = readJson(DEAD_KEY, {}) // base → time until which it's skipped
let directory = readJson(DIRECTORY_KEY, null)
let discovering = null

/**
 * Your own Mono proxy (a free Cloudflare Worker — see /worker). Public
 * servers mostly refuse requests from other websites (CORS); the proxy asks
 * them server-side instead. When set, it's the only server we talk to.
 */
let proxy = ''
export function setProxy(url = '') {
  proxy = url.trim().replace(/\/+$/, '')
}
export const hasProxy = () => !!proxy

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

/**
 * Record how a server did. A TypeError from fetch means the browser refused
 * the response (CORS) or the server is unreachable — skip it for 12 hours
 * instead of hitting it on every song.
 */
export function reportInstance(base, ok, err) {
  if (base.startsWith(proxy) && proxy) return
  const prev = health[base] ?? 0
  health[base] = Math.max(-10, Math.min(10, prev * 0.9 + (ok ? 2 : -3)))
  writeJson(HEALTH_KEY, health)
  if (ok && dead[base]) delete dead[base]
  if (!ok && err?.name === 'TypeError') dead[base] = Date.now() + DEAD_FOR
  writeJson(DEAD_KEY, dead)
}

const alive = (base) => !(dead[base] > Date.now())

async function fetchJson(url, ms) {
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

/** Refresh the live instance directories (at most every few hours). */
function discover() {
  if (directory && Date.now() - directory.at < DIRECTORY_TTL) return Promise.resolve(directory)
  if (discovering) return discovering
  discovering = Promise.allSettled([
    fetchJson('https://piped-instances.kavin.rocks/', 6000),
    fetchJson('https://api.invidious.io/instances.json?sort_by=health', 6000),
  ])
    .then(([piped, inv]) => {
      const p =
        piped.status === 'fulfilled' && Array.isArray(piped.value)
          ? piped.value.map((i) => i.api_url).filter((u) => /^https:\/\//.test(u ?? ''))
          : []
      const v =
        inv.status === 'fulfilled' && Array.isArray(inv.value)
          ? inv.value
              .filter(([, i]) => i?.api && i?.cors && i?.type === 'https' && i?.uri)
              .map(([, i]) => i.uri.replace(/\/$/, ''))
          : []
      directory = { at: Date.now(), piped: p, invidious: v }
      writeJson(DIRECTORY_KEY, directory)
      return directory
    })
    .finally(() => (discovering = null))
  return discovering
}

const byHealth = (list) =>
  [...new Set(list)].sort((a, b) => (health[b] ?? 0) - (health[a] ?? 0))

/** Instances ordered healthiest-first, minus ones that refused us recently. */
export function pipedInstances() {
  if (proxy) return [`${proxy}/piped`]
  discover().catch(() => {})
  return byHealth([...STATIC_PIPED, ...(directory?.piped ?? [])]).filter(alive)
}

export function invidiousInstances() {
  if (proxy) return [`${proxy}/inv`]
  discover().catch(() => {})
  return byHealth([...STATIC_INVIDIOUS, ...(directory?.invidious ?? [])]).filter(alive)
}

export { fetchJson }
