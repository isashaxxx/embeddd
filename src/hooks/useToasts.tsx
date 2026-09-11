import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export interface Toast {
  id: number
  title: string
  description?: string
  emoji?: string
  action?: { label: string; onClick: () => void }
}

type ShowToast = (toast: Omit<Toast, 'id'>) => void

const ToastContext = createContext<ShowToast>(() => {})

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback<ShowToast>(
    (toast) => {
      const id = nextId++
      setToasts((list) => [...list.slice(-3), { ...toast, id }])
      setTimeout(() => dismiss(id), toast.action ? 6000 : 4500)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast${t.emoji ? ' toast-achievement' : ''}`}>
              {t.emoji && <span className="toast-emoji">{t.emoji}</span>}
              <div className="toast-text">
                <b>{t.title}</b>
                {t.description && <span>{t.description}</span>}
              </div>
              {t.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
