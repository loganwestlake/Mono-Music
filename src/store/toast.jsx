import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const ToastContext = createContext(() => {})

/**
 * Small black pill notifications, bottom-centre.
 * toast('Saved') or toast('Removed', { action: { label: 'Undo', run } }).
 */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef()

  const show = useCallback((message, { action, duration } = {}) => {
    clearTimeout(timer.current)
    setToast({ message, action, key: Date.now() })
    timer.current = setTimeout(() => setToast(null), duration ?? (action ? 5500 : 3200))
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+150px)] z-[80] flex justify-center px-4 lg:bottom-28">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.key}
              role="status"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              className="pointer-events-auto flex max-w-md items-center gap-4 rounded-full bg-[#111] py-3 pr-3 pl-5 text-[12px] font-medium tracking-tight text-white shadow-xl"
            >
              <span className={toast.action ? '' : 'pr-2'}>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action.run()
                    setToast(null)
                  }}
                  className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#111]"
                >
                  {toast.action.label}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
