import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import Button from './Button'

export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false 
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink/20 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
              className="w-full max-w-sm rounded-2xl border border-line bg-bg p-6 shadow-xl pointer-events-auto"
            >
              <div className="flex items-start justify-between">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isDanger ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent'}`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <button
                  onClick={onClose}
                  className="rounded-full p-1 text-muted transition hover:bg-bg-elev hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                {message}
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">
                  {cancelText}
                </Button>
                <Button 
                  variant={isDanger ? 'primary' : 'primary'} 
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }} 
                  className={`w-full sm:w-auto ${isDanger ? 'bg-danger hover:bg-danger/90 border-danger' : ''}`}
                >
                  {confirmText}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
