import React from 'react'
import { Music2 } from 'lucide-react'

interface EmptyStateProps {
  onImport: () => void
}

export function EmptyState({ onImport }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Music2 size={48} />
      </div>
      <h2>Nenhum som ainda</h2>
      <p>Importe arquivos de áudio para começar sua honkpad.</p>
      <button className="btn-primary large" onClick={onImport}>
        + Importar Áudios
      </button>
      <p className="empty-hint">
        Suporta MP3, WAV, OGG, M4A, FLAC, AAC
      </p>
    </div>
  )
}
