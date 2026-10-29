/**
 * Artist directory for onboarding. Pulls the live chart (with photos) from
 * Deezer's public API over JSONP (it has no CORS headers), falling back to a
 * static list rendered as monograms.
 */

const FALLBACK = [
  'Taylor Swift', 'The Weeknd', 'Billie Eilish', 'Kendrick Lamar', 'SZA', 'Drake',
  'Dua Lipa', 'Bad Bunny', 'Frank Ocean', 'Radiohead', 'Daft Punk', 'Adele',
  'Beyoncé', 'Tyler, The Creator', 'Lana Del Rey', 'Arctic Monkeys', 'Bruno Mars', 'Olivia Rodrigo',
].map((name) => ({ name, picture: null }))

function jsonp(url, ms = 8000) {
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
      resolve(data)
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('failed'))
    }
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`
    document.head.appendChild(script)
  })
}

let chartPromise

export function topArtists() {
  if (!chartPromise) {
    chartPromise = jsonp('https://api.deezer.com/chart/0/artists?limit=30')
      .then((data) => {
        const list = (data?.data || []).map((a) => ({ name: a.name, picture: a.picture_big || a.picture_medium }))
        return list.length >= 6 ? list : FALLBACK
      })
      .catch(() => FALLBACK)
  }
  return chartPromise
}
