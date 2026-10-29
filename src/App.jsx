import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Onboarding from './screens/Onboarding'
import ChooseArtists from './screens/ChooseArtists'
import NowPlaying from './screens/NowPlaying'

const SCREENS = ['onboarding', 'artists', 'now-playing']

// Screens are addressable by hash (#onboarding, #artists, #now-playing).
const fromHash = () => {
  const hash = window.location.hash.slice(1)
  return SCREENS.includes(hash) ? hash : 'onboarding'
}

export default function App() {
  const [screen, setScreen] = useState(fromHash)

  useEffect(() => {
    const onHash = () => setScreen(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (next) => {
    window.location.hash = next
  }

  return (
    // On larger viewports the app sits in a phone-width column.
    <div className="min-h-dvh bg-[#E9E9E9] sm:py-8">
      <div className="relative mx-auto min-h-dvh max-w-[430px] overflow-x-hidden bg-[#F2F2F2] sm:min-h-[860px] sm:rounded-[44px] sm:shadow-[0_40px_80px_-40px_rgba(0,0,0,0.35)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {screen === 'onboarding' && (
              <Onboarding onSignUp={() => go('artists')} onSignIn={() => go('now-playing')} />
            )}
            {screen === 'artists' && (
              <ChooseArtists onBack={() => go('onboarding')} onContinue={() => go('now-playing')} />
            )}
            {screen === 'now-playing' && <NowPlaying onBack={() => go('artists')} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
