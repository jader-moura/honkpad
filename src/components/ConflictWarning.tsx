import React from 'react'
import { AlertTriangle, Settings, X } from 'lucide-react'
import { ConflictInfo } from '../types/global'

interface ConflictWarningProps {
  conflict: ConflictInfo
  onDismiss: () => void
}

export function ConflictWarning({ conflict, onDismiss }: ConflictWarningProps) {
  if (!conflict.hasConflict) return null

  async function openSettings() {
    await window.electronAPI.openSoundSettings()
  }

  return (
    <div className="conflict-banner">
      <div className="conflict-banner-content">
        <AlertTriangle size={18} className="conflict-icon" />
        <div className="conflict-text">
          <strong>Conflito de áudio detectado</strong>
          <ul className="conflict-details">
            {conflict.details.map((detail, i) => (
              <li key={i}>{detail}</li>
            ))}
          </ul>
          <span className="conflict-hint">
            Para evitar problemas, configure uma entrada de áudio separada para o Honkpad.
          </span>
        </div>
      </div>
      <div className="conflict-actions">
        <button className="btn-secondary" onClick={openSettings}>
          <Settings size={13} /> Configurações de Som
        </button>
        <button className="conflict-dismiss" onClick={onDismiss} title="Dispensar">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
