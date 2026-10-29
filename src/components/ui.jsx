import { motion } from 'framer-motion'

/** Thin, round, borderless tap target for a stroke icon. */
export function IconButton({ icon: Icon, label, onClick, active = false, fill = 'none', size = 20, className = '' }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      className={`relative grid h-11 w-11 place-items-center rounded-full transition-colors ${
        active ? 'text-[#111]' : 'text-[#111]/80 hover:text-[#111]'
      } ${className}`}
    >
      <Icon size={size} strokeWidth={1.25} fill={fill} />
      {active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#111]" />}
    </motion.button>
  )
}

/** Three-column iOS-style header: left action, small centred label, right action. */
export function ScreenHeader({ left, title, right }) {
  return (
    <header className="grid grid-cols-[44px_1fr_44px] items-center px-4 pt-[max(env(safe-area-inset-top),16px)]">
      <div>{left}</div>
      <h1 className="text-center text-[11px] font-semibold uppercase tracking-widest text-[#111]">{title}</h1>
      <div>{right}</div>
    </header>
  )
}

/** Tiny uppercase eyebrow / metadata text. */
export function Eyebrow({ children, className = '' }) {
  return (
    <p className={`text-[10px] font-bold uppercase tracking-widest text-neutral-400 ${className}`}>{children}</p>
  )
}

/** Solid black pill call-to-action. */
export function PillButton({ children, onClick, className = '' }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={`h-14 w-full rounded-full bg-[#111] text-[12px] font-semibold uppercase tracking-widest text-white transition-opacity hover:opacity-90 ${className}`}
    >
      {children}
    </motion.button>
  )
}

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

/** `onError` for photos: swap in a transparent pixel so the gray backdrop shows instead of a broken icon. */
export const hideBroken = (e) => {
  e.currentTarget.alt = ''
  e.currentTarget.src = BLANK
}
