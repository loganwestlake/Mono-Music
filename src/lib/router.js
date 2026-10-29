import { useEffect, useState } from 'react'

/**
 * Hash router. Works on any static host (GitHub Pages included) without
 * server rewrites: #/search?q=jazz → { path: '/search', params, segments }.
 */
function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  return {
    path,
    segments: path.split('/').filter(Boolean),
    params: new URLSearchParams(query),
  }
}

export function useRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to) {
  window.location.hash = to
}

export function href(to) {
  return `#${to}`
}
