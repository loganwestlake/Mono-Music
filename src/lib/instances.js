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
const DIRECTORY_KEY = 'mono:v1:instance-directory'
const DIRECTORY_TTL = 6 * 60 * 60 * 1000

let health = readJson(HEALTH_KEY, {}) // base → score (successes − failures, decayed)
let directory = readJson(DIRECTORY_KEY, null)
let discovering = null

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

export function reportInstance(base, ok) {
  const prev = health[base] ?? 0
  health[base] = Math.max(-10, Math.min(10, prev * 0.9 + (ok ? 2 : -3)))
  writeJson(HEALTH_KEY, health)
}

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

/** Instances ordered healthiest-first. Kicks off discovery in the background. */
export function pipedInstances() {
  discover().catch(() => {})
  return byHealth([...STATIC_PIPED, ...(directory?.piped ?? [])])
}

export function invidiousInstances() {
  discover().catch(() => {})
  return byHealth([...STATIC_INVIDIOUS, ...(directory?.invidious ?? [])])
}

export { fetchJson }
