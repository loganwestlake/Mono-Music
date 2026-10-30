// Stand-in for the YouTube IFrame API used by the automated tests.
// window.__ytAd = seconds of pre-roll ad per load; window.__ytAdStyle picks how
// the fake reports it: 'short' (getDuration = ad length), 'zero' (0 while the
// ad plays), 'main' (reports the song's length, time stuck at 0).
window.YT = {
  PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  Player: class {
    constructor(el, opts) {
      this.opts = opts
      const f = document.createElement('iframe')
      f.style.background = '#777'
      el.replaceWith(f)
      this.t = 0
      this.state = -1
      this.last = 0
      this.muted = false
      this.vol = 100
      this.log = []
      window.__yt = this
      setTimeout(() => opts.events.onReady({ target: this }), 30)
      // Sample what the listener hears while an ad plays.
      setInterval(() => {
        if (this.state === 1 && this.adLeft() > 0) {
          window.__adSamples = (window.__adSamples || 0) + 1
          if (!this.muted && this.vol > 0) window.__adHeard = (window.__adHeard || 0) + 1
        }
      }, 50)
    }
    adLeft() {
      return this.adUntil ? Math.max(0, this.adUntil - performance.now()) / 1000 : 0
    }
    _set(s) {
      if (this.state === 1 && !this.adLeft()) this.t = this.getCurrentTime()
      this.state = s
      this.last = performance.now()
      this.opts.events.onStateChange({ data: s, target: this })
    }
    loadVideoById(o) {
      this.log.push(o.videoId)
      this.id = o.videoId
      this.t = o.startSeconds || 0
      this.adUntil = window.__ytAd ? performance.now() + 80 + window.__ytAd * 1000 : 0
      this._set(3)
      setTimeout(() => this._set(1), 80)
      if (this.adUntil)
        setTimeout(() => {
          this.adUntil = 0
          this.last = performance.now()
        }, 80 + window.__ytAd * 1000)
    }
    cueVideoById(o) {
      this.id = o.videoId
      this.t = o.startSeconds || 0
      this._set(5)
    }
    playVideo() {
      this._set(1)
    }
    pauseVideo() {
      this._set(2)
    }
    stopVideo() {
      this.state = 5
    }
    seekTo(s) {
      this.log.push('seek:' + s.toFixed(1) + '@' + Math.round(performance.now()))
      this.t = s
      this.last = performance.now()
    }
    getCurrentTime() {
      const ad = this.adLeft()
      if (ad > 0) return window.__ytAdStyle === 'main' ? this.t : window.__ytAd - ad
      return this.state === 1 ? this.t + (performance.now() - this.last) / 1000 : this.t
    }
    getDuration() {
      if (this.adLeft() > 0) {
        if (window.__ytAdStyle === 'zero') return 0
        if (window.__ytAdStyle === 'main') return 200
        return window.__ytAd
      }
      return 200
    }
    getPlayerState() {
      return this.state
    }
    setVolume(v) {
      this.vol = v
    }
    getVolume() {
      return this.vol
    }
    mute() {
      this.muted = true
    }
    unMute() {
      this.muted = false
    }
    isMuted() {
      return this.muted
    }
    setPlaybackRate() {}
    destroy() {}
    getVideoData() {
      return { video_id: this.id, title: 'Artist - Song (Official Video)', author: 'Artist' }
    }
  },
}
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady()
