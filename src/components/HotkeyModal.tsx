import React, { useEffect, useRef, useState } from 'react'

interface HotkeyModalProps {
  currentHotkey: string | null
  soundName: string
  onConfirm: (hotkey: string | null) => void
  onClose: () => void
}

function formatKey(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')

  const key = e.key
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    // Normalize F-keys and regular keys
    parts.push(key.length === 1 ? key.toUpperCase() : key)
  }

  return parts.join('+')
}

export function HotkeyModal({ currentHotkey, soundName, onConfirm, onClose }: HotkeyModalProps) {
  const [captured, setCaptured] = useState<string | null>(null)
  const [listening, setListening] = useState(true)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listening) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const formatted = formatKey(e)
      if (!formatted || formatted === '' || ['Control', 'Alt', 'Shift', 'Meta'].includes(formatted)) return

      setCaptured(formatted)
      setListening(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [listening])

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={(e) => e.target === overlayRef.current && onClose()}>
      <div className="modal-box">
        <h2 className="modal-title">Configurar Hotkey</h2>
        <p className="modal-subtitle">
          Som: <strong>{soundName}</strong>
        </p>

        <div className={`hotkey-capture-area ${listening ? 'listening' : 'captured'}`}>
          {listening ? (
            <>
              <div className="pulse-ring" />
              <span className="capture-hint">Pressione uma tecla ou combinação…</span>
            </>
          ) : (
            <span className="captured-key">{captured}</span>
          )}
        </div>

        {!listening && (
          <button className="btn-secondary small" onClick={() => { setCaptured(null); setListening(true) }}>
            Tentar novamente
          </button>
        )}

        <div className="modal-actions">
          {currentHotkey && (
            <button className="btn-ghost" onClick={() => onConfirm(null)}>
              Remover hotkey
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={!captured}
            onClick={() => captured && onConfirm(captured)}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
