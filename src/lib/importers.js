import { unresolvedId } from './tracks'

/**
 * Playlist importers. Every importer returns { name, tracks } where tracks
 * are { id, title, artist, duration, cover? } — Spotify/CSV/text tracks use
 * unresolved ids and get matched to YouTube videos afterwards.
 */

const track = (title, artist, duration = 0, cover = null) => ({
  id: unresolvedId(artist, title),
  title: title.trim(),
  artist: artist.trim() || 'Unknown artist',
  duration: Math.round(duration) || 0,
  cover,
})

/* ── Spotify (Authorization Code + PKCE — no secret needed) ───────────── */

const SPOTIFY_TOKEN_KEY = 'mono:spotify-token'
const SPOTIFY_VERIFIER_KEY = 'mono:spotify-verifier'
const SPOTIFY_STATE_KEY = 'mono:spotify-state'
const SPOTIFY_SCOPES = 'playlist-read-private playlist-read-collaborative user-library-read'

export const spotifyRedirectUri = () => `${window.location.origin}${window.location.pathname}`

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function startSpotifyLogin(clientId) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const state = base64url(crypto.getRandomValues(new Uint8Array(12)))
  sessionStorage.setItem(SPOTIFY_VERIFIER_KEY, verifier)
  sessionStorage.setItem(SPOTIFY_STATE_KEY, `${state}|${clientId}`)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: spotifyRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
}

/**
 * Call once on app start: if Spotify just redirected back with ?code=…,
 * trade it for a token and clean the URL. Returns true when a login completed.
 */
export async function completeSpotifyLogin() {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  if (!code && !error) return false

  const [expected, clientId] = (sessionStorage.getItem(SPOTIFY_STATE_KEY) || '').split('|')
  const verifier = sessionStorage.getItem(SPOTIFY_VERIFIER_KEY)
  url.search = ''
  url.hash = '#/library?import=spotify'
  window.history.replaceState(null, '', url)
  sessionStorage.removeItem(SPOTIFY_STATE_KEY)
  sessionStorage.removeItem(SPOTIFY_VERIFIER_KEY)
  if (error || state !== expected || !verifier) return false

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyRedirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) return false
  const data = await res.json()
  sessionStorage.setItem(
    SPOTIFY_TOKEN_KEY,
    JSON.stringify({ token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 }),
  )
  return true
}

function spotifyToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(SPOTIFY_TOKEN_KEY))
    return t && t.expires > Date.now() ? t.token : null
  } catch {
    return null
  }
}

export const spotifyConnected = () => !!spotifyToken()
export const spotifyDisconnect = () => sessionStorage.removeItem(SPOTIFY_TOKEN_KEY)

async function spotifyGet(url) {
  const token = spotifyToken()
  if (!token) throw new Error('Not connected to Spotify')
  const res = await fetch(url.startsWith('http') ? url : `https://api.spotify.com/v1${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    spotifyDisconnect()
    throw new Error('Spotify session expired — connect again.')
  }
  if (!res.ok) throw new Error(`Spotify error ${res.status}`)
  return res.json()
}

export async function spotifyPlaylists() {
  const lists = [{ id: 'liked', name: 'Liked Songs', count: null, image: null }]
  let next = '/me/playlists?limit=50'
  while (next) {
    const page = await spotifyGet(next)
    page.items
      .filter(Boolean)
      .forEach((p) => lists.push({ id: p.id, name: p.name, count: p.tracks?.total ?? null, image: p.images?.[0]?.url }))
    next = page.next
  }
  return lists
}

export async function spotifyPlaylistTracks(playlist, onProgress) {
  const out = []
  let next =
    playlist.id === 'liked'
      ? '/me/tracks?limit=50'
      : `/playlists/${playlist.id}/tracks?limit=100&fields=next,total,items(track(name,duration_ms,artists(name),album(images)))`
  while (next) {
    const page = await spotifyGet(next)
    for (const item of page.items || []) {
      const t = item.track
      if (!t?.name) continue
      out.push(track(t.name, (t.artists || []).map((a) => a.name).join(', '), (t.duration_ms || 0) / 1000, t.album?.images?.[0]?.url))
    }
    onProgress?.(out.length, page.total)
    next = page.next
  }
  return { name: playlist.name, tracks: out }
}

/* ── CSV (Exportify, TuneMyMusic, Soundiiz…) ──────────────────────────── */

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

export function importCsv(text, name = 'Imported playlist') {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('That file has no songs in it.')
  const header = rows[0].map((h) => h.toLowerCase().trim())
  const col = (...names) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)))
  const ti = col('track name', 'title', 'song', 'name')
  const ai = col('artist name', 'artist')
  const di = col('duration (ms)', 'duration_ms', 'duration')
  const ci = col('album image url', 'image')
  if (ti < 0) throw new Error('Couldn’t find a “Track Name” or “Title” column.')
  const tracks = rows.slice(1).map((r) => {
    const raw = Number(r[di]) || 0
    const seconds = raw > 10000 ? raw / 1000 : raw
    return track(r[ti] ?? '', (r[ai] ?? '').replace(/;/g, ', '), seconds, r[ci] || null)
  })
  return { name, tracks: tracks.filter((t) => t.title) }
}

/* ── Plain text: one "Artist - Title" per line ───────────────────────── */

export function importText(text, name = 'Imported playlist') {
  const tracks = text
    .split('\n')
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.+?)\s+[-–—]\s+(.+)$/) || l.match(/^(.+?)\s+by\s+(.+)$/i)
      if (!m) return track(l, '')
      return /\sby\s/i.test(l) && !/\s[-–—]\s/.test(l) ? track(m[1], m[2]) : track(m[2], m[1])
    })
  if (!tracks.length) throw new Error('Paste at least one song.')
  return { name, tracks }
}

/** Pull a playlist id out of a YouTube / YouTube Music URL. */
export function youtubePlaylistId(input = '') {
  try {
    const url = new URL(input.trim())
    return url.searchParams.get('list')
  } catch {
    return /^(PL|OL|RD|UU|FL)[\w-]{10,}$/.test(input.trim()) ? input.trim() : null
  }
}
