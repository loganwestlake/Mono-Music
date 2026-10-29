import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { IconButton } from './ui'

/**
 * Icon button that opens a small black dropdown.
 * items: [{ icon?, label, run, checked?, hint? } | 'divider' | { heading }]
 */
export default function Menu({ icon, label, items, align = 'right', direction = 'down', size = 16, className = '', buttonClassName = 'h-9 w-9', active }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <IconButton icon={icon} label={label} onClick={() => setOpen((o) => !o)} size={size} className={buttonClassName} active={active} />
      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            initial={{ opacity: 0, y: direction === 'up' ? 4 : -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === 'up' ? 4 : -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 w-56 overflow-hidden rounded-2xl bg-[#111] p-1.5 text-white shadow-2xl ${
              align === 'right' ? 'right-0' : 'left-0'
            } ${direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          >
            {items.filter(Boolean).map((item, i) => {
              if (item === 'divider') return <li key={i} className="my-1 h-px bg-white/10" />
              if (item.heading)
                return (
                  <li key={i} className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-white/40">
                    {item.heading}
                  </li>
                )
              const Icon = item.icon
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false)
                      item.run()
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium hover:bg-white/10"
                  >
                    {Icon ? <Icon size={16} strokeWidth={1.25} /> : <span className="w-4" />}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="text-[10px] text-white/40">{item.hint}</span>}
                    {item.checked && <Check size={14} strokeWidth={2} />}
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
