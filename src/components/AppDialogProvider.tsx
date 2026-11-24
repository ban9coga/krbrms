'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  getActiveAppDialog,
  settleAppDialog,
  subscribeAppDialogs,
} from '@/src/lib/appDialog'

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const dialog = useSyncExternalStore(subscribeAppDialogs, getActiveAppDialog, () => null)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!dialog) return
    if (dialog.kind === 'prompt') inputRef.current?.focus()
    else closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dialog.kind !== 'alert') {
        event.preventDefault()
        settleAppDialog(dialog.kind === 'confirm' ? false : null)
      }
      if (event.key === 'Enter' && dialog.kind === 'confirm') {
        event.preventDefault()
        settleAppDialog(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialog])

  return (
    <>
      {children}
      {dialog && (
        <div className="app-dialog-backdrop" role="presentation">
          <section
            className="app-dialog"
            role={dialog.kind === 'alert' ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby={`app-dialog-title-${dialog.id}`}
            aria-describedby={`app-dialog-message-${dialog.id}`}
          >
            <div className="app-dialog-mark" aria-hidden="true">
              {dialog.kind === 'alert' ? '!' : dialog.kind === 'confirm' ? '?' : '✎'}
            </div>
            <h2 id={`app-dialog-title-${dialog.id}`} className="app-dialog-title">
              {dialog.kind === 'alert' ? 'Informasi' : dialog.kind === 'confirm' ? 'Konfirmasi' : 'Masukkan alasan'}
            </h2>
            <p id={`app-dialog-message-${dialog.id}`} className="app-dialog-message">
              {dialog.message}
            </p>
            {dialog.kind === 'prompt' && (
              <input
                ref={inputRef}
                className="app-dialog-input"
                aria-label="Jawaban"
                defaultValue={dialog.defaultValue ?? ''}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    settleAppDialog(event.currentTarget.value)
                  }
                }}
              />
            )}
            <div className="app-dialog-actions">
              {dialog.kind !== 'alert' && (
                <button
                  type="button"
                  className="app-dialog-button app-dialog-button-secondary"
                  onClick={() => settleAppDialog(dialog.kind === 'confirm' ? false : null)}
                >
                  Batal
                </button>
              )}
              <button
                ref={closeRef}
                type="button"
                className="app-dialog-button app-dialog-button-primary"
                onClick={() => settleAppDialog(dialog.kind === 'confirm' ? true : dialog.kind === 'prompt' ? inputRef.current?.value ?? '' : null)}
              >
                {dialog.kind === 'alert' ? 'Mengerti' : dialog.kind === 'confirm' ? 'Lanjutkan' : 'Simpan'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
