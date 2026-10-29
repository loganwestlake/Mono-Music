import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton } from './ui'

export const SHORTCUTS = [
  ['Space', 'Play / pause'],
  ['Shift →', 'Next song'],
  ['Shift ←', 'Previous song'],
  ['→  ←', 'Seek 5 seconds'],
  ['↑  ↓', 'Volume'],
  ['M', 'Mute'],
  ['S', 'Shuffle'],
  ['R', 'Repeat'],
  ['L', 'Like current song'],
  ['Y', 'Lyrics'],
  ['Q', 'Queue / Now Playing'],
  ['D', 'Dark mode'],
  ['/', 'Search'],
  ['⌘K  Ctrl K', 'Quick search'],
  ['?', 'This list'],
]

export default function ShortcutsDialog({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[85] grid place-items-center bg-black/30 px-4 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="Keyboard shortcuts"
            className="w-full max-w-md rounded-3xl bg-[#F2F2F2] p-6 shadow-2xl"
            initial={{ y: 16, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-[28px] leading-none font-black tracking-tight">
                Keyboard <span className="font-serif font-normal italic">shortcuts</span>
              </h2>
              <IconButton icon={X} label="Close" onClick={onClose} className="-mt-2 -mr-3" />
            </div>
            <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[13px]">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>
                    <kbd className="rounded-md border border-black/15 bg-white px-2 py-0.5 font-sans text-[11px] font-semibold whitespace-pre">
                      {k}
                    </kbd>
                  </dt>
                  <dd className="text-neutral-500">{v}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
