import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

/** Thin, round, borderless tap target for a stroke icon. */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  fill = 'none',
  size = 20,
  className = '',
  dot = true,
  tone = 'dark',
  ...rest
}) {
  const toneClass = tone === 'light' ? 'text-white hover:bg-white/10' : 'text-[#111] hover:bg-black/5'
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-30 ${toneClass} ${className}`}
      {...rest}
    >
      <Icon size={size} strokeWidth={1.25} fill={fill} />
      {active && dot && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-current" />}
    </motion.button>
  )
}

/** Tiny uppercase eyebrow / metadata text. */
export function Eyebrow({ children, className = '' }) {
  return <p className={`text-[10px] font-bold uppercase tracking-widest text-neutral-400 ${className}`}>{children}</p>
}

/** Pill call-to-action; `solid` (black) or `outline`. */
export function PillButton({ children, onClick, variant = 'solid', className = '', icon: Icon, ...rest }) {
  const styles =
    variant === 'solid'
      ? 'bg-[#111] text-white hover:opacity-90'
      : 'border border-[#111]/15 text-[#111] hover:border-[#111]/40'
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[11px] font-semibold uppercase tracking-widest transition disabled:opacity-40 ${styles} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={16} strokeWidth={1.5} />}
      {children}
    </motion.button>
  )
}

/** Editorial page heading with optional eyebrow above. */
export function PageTitle({ eyebrow, children, className = '' }) {
  return (
    <div className={className}>
      {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
      <h1 className="text-[52px] leading-[0.88] font-black tracking-[-0.04em] text-[#111] md:text-[88px]">{children}</h1>
    </div>
  )
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-4 flex min-h-9 items-center justify-between gap-4">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#111]">{children}</h2>
      {action}
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <p className="text-[22px] font-black tracking-tight">{title}</p>
      {children && <p className="mt-2 max-w-sm text-[13px] text-neutral-400">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function Spinner({ className = '' }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-current border-t-transparent ${className}`}
      aria-label="Loading"
    />
  )
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
