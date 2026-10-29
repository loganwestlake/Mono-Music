/** Loads the YouTube IFrame Player API once. Rejects if it can't load (blocked network, extension, offline). */

let apiPromise

export function loadYouTubeApi(timeoutMs = 15000) {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error('YouTube API timed out')), timeoutMs)
    function fail(err) {
      clearTimeout(timer)
      apiPromise = null
      reject(err)
    }

    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      clearTimeout(timer)
      resolve(window.YT)
    }

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => fail(new Error('YouTube API failed to load'))
    document.head.appendChild(script)
  })
  return apiPromise
}

export const PLAYER_VARS = {
  autoplay: 0,
  controls: 0,
  disablekb: 1,
  fs: 0,
  iv_load_policy: 3, // hide annotations
  modestbranding: 1,
  playsinline: 1,
  rel: 0,
}

/** Human-readable text for YouTube player error codes. */
export function describePlayerError(code) {
  switch (code) {
    case 2:
      return 'That video link looks invalid.'
    case 5:
      return 'This video can’t be played in your browser.'
    case 100:
      return 'This video was removed or made private.'
    case 101:
    case 150:
    case 153:
      return 'The uploader doesn’t allow this video to play outside YouTube.'
    default:
      return 'This video couldn’t be played.'
  }
}
