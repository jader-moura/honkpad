import React, { useRef, useState } from 'react'
import { X, FolderOpen, Search, Play, Square, Plus, Check, Loader } from 'lucide-react'
import { MyInstantResult } from '../types/global'

interface ImportModalProps {
  onFileImport: () => Promise<void>
  addSounds: (filePaths: string[]) => Promise<void>
  onClose: () => void
}

type TabId = 'file' | 'myinstants'
type ItemState = 'idle' | 'downloading' | 'added'

function toFileUrl(p: string): string {
  const n = p.replace(/\\/g, '/')
  return n.startsWith('/') ? `file://${n}` : `file:///${n}`
}

export function ImportModal({ onFileImport, addSounds, onClose }: ImportModalProps) {
  const [tab, setTab] = useState<TabId>('file')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MyInstantResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({})

  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [previewingSlug, setPreviewingSlug] = useState<string | null>(null)

  const search = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setSearchError(null)
    setResults([])
    try {
      const res = await window.electronAPI.searchMyInstants(q)
      setResults(res)
      if (res.length === 0) setSearchError('Nenhum resultado encontrado.')
    } catch {
      setSearchError('Erro ao buscar. Verifique sua conexão.')
    } finally {
      setSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') search()
  }

  const togglePreview = (result: MyInstantResult) => {
    if (previewingSlug === result.slug) {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
      setPreviewingSlug(null)
      return
    }
    previewAudioRef.current?.pause()
    const url = result.mp3Url.startsWith('http')
      ? result.mp3Url
      : `https://www.myinstants.com${result.mp3Url}`
    const audio = new Audio(url)
    audio.addEventListener('ended', () => setPreviewingSlug(null))
    audio.play().catch(() => { })
    previewAudioRef.current = audio
    setPreviewingSlug(result.slug)
  }

  const handleAdd = async (result: MyInstantResult) => {
    setItemStates(s => ({ ...s, [result.slug]: 'downloading' }))
    try {
      const filePath = await window.electronAPI.downloadMyInstantSound(result.mp3Url, result.name)
      await addSounds([filePath])
      setItemStates(s => ({ ...s, [result.slug]: 'added' }))
    } catch {
      setItemStates(s => ({ ...s, [result.slug]: 'idle' }))
    }
  }

  const handleFileImport = async () => {
    await onFileImport()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box import-modal" onClick={e => e.stopPropagation()}>
        <button className="stereo-guide-close" onClick={onClose}><X size={14} /></button>
        <h2 className="modal-title">Importar Áudio</h2>

        <div className="import-tab-bar">
          <button
            className={`import-tab ${tab === 'file' ? 'active' : ''}`}
            onClick={() => setTab('file')}
          >
            <FolderOpen size={13} /> Arquivo
          </button>
          <button
            className={`import-tab ${tab === 'myinstants' ? 'active' : ''}`}
            onClick={() => setTab('myinstants')}
          >
            <Search size={13} /> MyInstants
          </button>
        </div>

        {tab === 'file' && (
          <div className="import-file-tab">
            <p className="import-file-hint">Selecione arquivos de áudio do seu computador (MP3, WAV, OGG, M4A…)</p>
            <button className="btn-primary" onClick={handleFileImport}>
              <FolderOpen size={15} /> Selecionar Arquivos
            </button>
          </div>
        )}

        {tab === 'myinstants' && (
          <div className="import-myinstants-tab">
            <div className="import-search-row">
              <div className="search-box" style={{ flex: 1 }}>
                <Search size={13} className="search-icon" />
                <input
                  className="search-input"
                  style={{ width: '100%' }}
                  placeholder="Buscar no MyInstants…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
              </div>
              <button className="btn-primary" onClick={search} disabled={searching || !query.trim()}>
                {searching ? <Loader size={14} className="spin" /> : 'Buscar'}
              </button>
            </div>

            {searchError && <p className="import-error">{searchError}</p>}

            {results.length > 0 && (
              <div className="import-results">
                {results.map(r => {
                  const state = itemStates[r.slug] ?? 'idle'
                  return (
                    <div key={r.slug} className="import-result-row">
                      <button
                        className={`preview-btn ${previewingSlug === r.slug ? 'previewing' : ''}`}
                        onClick={() => togglePreview(r)}
                        title={previewingSlug === r.slug ? 'Parar' : 'Ouvir'}
                      >
                        {previewingSlug === r.slug
                          ? <Square size={11} fill="currentColor" />
                          : <Play size={11} fill="currentColor" />}
                      </button>
                      <span className="import-result-name">{r.name}</span>
                      <button
                        className={`import-add-btn ${state === 'added' ? 'added' : ''}`}
                        onClick={() => state === 'idle' && handleAdd(r)}
                        disabled={state !== 'idle'}
                        title="Adicionar ao Honkpad"
                      >
                        {state === 'downloading' && <Loader size={13} className="spin" />}
                        {state === 'added' && <Check size={13} />}
                        {state === 'idle' && <Plus size={13} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
