import React from 'react'
import { Music2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface EmptyStateProps {
  onImport: () => void
}

export function EmptyState({ onImport }: EmptyStateProps) {
  const { t } = useTranslation()
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Music2 size={48} />
      </div>
      <h2>{t('sounds.emptyTitle')}</h2>
      <p>{t('sounds.emptyDesc')}</p>
      <button className="btn-primary large" onClick={onImport}>
        + {t('button.importAudios')}
      </button>
      <p className="empty-hint">
        {t('sounds.supportedFormats')}
      </p>
    </div>
  )
}
