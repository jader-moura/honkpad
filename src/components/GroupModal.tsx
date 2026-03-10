import React, { useEffect, useRef, useState } from 'react'
import { X, Plus, Trash2, Keyboard, Play, Square } from 'lucide-react'
import { SoundEntry, SoundGroup } from '../types/global'

function toFileUrl(p: string): string {
    const n = p.replace(/\\/g, '/')
    return n.startsWith('/') ? `file://${n}` : `file:///${n}`
}

interface GroupModalProps {
    group: SoundGroup
    allSounds: SoundEntry[]
    onSave: (updated: SoundGroup) => void
    onClose: () => void
}

type ModalStep = 'edit' | 'hotkey'

export function GroupModal({ group, allSounds, onSave, onClose }: GroupModalProps) {
    const [name, setName] = useState(group.name)
    const [soundIds, setSoundIds] = useState<string[]>(group.soundIds)
    const [hotkey, setHotkey] = useState<string | null>(group.hotkey)
    const [step, setStep] = useState<ModalStep>('edit')

    // Hotkey capture state
    const [listening, setListening] = useState(false)
    const [capturedKeys, setCapturedKeys] = useState<string[]>([])
    const captureRef = useRef<HTMLDivElement>(null)

    // Sounds not yet in group
    const available = allSounds.filter(s => !soundIds.includes(s.id))
    const inGroup = allSounds.filter(s => soundIds.includes(s.id))

    const handleAddSound = (id: string) => setSoundIds(prev => [...prev, id])
    const handleRemoveSound = (id: string) => setSoundIds(prev => prev.filter(s => s !== id))

    // ── Audio preview ─────────────────────────────────────────────────────────
    const [previewingId, setPreviewingId] = useState<string | null>(null)
    const previewAudioRef = useRef<HTMLAudioElement | null>(null)

    const togglePreview = (sound: SoundEntry) => {
        if (previewingId === sound.id) {
            previewAudioRef.current?.pause()
            previewAudioRef.current = null
            setPreviewingId(null)
            return
        }
        previewAudioRef.current?.pause()
        const audio = new Audio(toFileUrl(sound.filePath))
        audio.addEventListener('ended', () => setPreviewingId(null))
        audio.play().catch(() => { })
        previewAudioRef.current = audio
        setPreviewingId(sound.id)
    }

    // Stop preview when modal unmounts
    useEffect(() => () => { previewAudioRef.current?.pause() }, [])

    const handleSave = () => {
        onSave({ ...group, name: name.trim() || group.name, soundIds, hotkey })
    }

    // ── Hotkey capture ──────────────────────────────────────────────────────────
    const formatKeys = (keys: string[]): string => {
        const order = ['Control', 'Alt', 'Shift', 'Meta']
        const mods = keys.filter(k => order.includes(k)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
        const normals = keys.filter(k => !order.includes(k))
        return [...mods, ...normals]
            .map(k => k === 'Control' ? 'Ctrl' : k === ' ' ? 'Space' : k)
            .join('+')
    }

    const formatElectron = (keys: string[]): string => {
        const map: Record<string, string> = {
            Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Super',
            ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
        }
        const order = ['Control', 'Alt', 'Shift', 'Meta']
        const mods = keys.filter(k => order.includes(k)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
        const normals = keys.filter(k => !order.includes(k))
        return [...mods, ...normals].map(k => map[k] ?? (k.length === 1 ? k.toUpperCase() : k)).join('+')
    }

    useEffect(() => {
        if (step !== 'hotkey' || !listening) return
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault()
            if (e.key === 'Escape') { setListening(false); setCapturedKeys([]); return }
            const held = new Set<string>()
            if (e.ctrlKey) held.add('Control')
            if (e.altKey) held.add('Alt')
            if (e.shiftKey) held.add('Shift')
            if (e.metaKey) held.add('Meta')
            const mods = ['Control', 'Alt', 'Shift', 'Meta']
            if (!mods.includes(e.key)) held.add(e.key)
            setCapturedKeys([...held])
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [step, listening])

    const confirmHotkey = () => {
        if (capturedKeys.length > 0) setHotkey(formatElectron(capturedKeys))
        setStep('edit')
        setListening(false)
        setCapturedKeys([])
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box group-modal-box" onClick={e => e.stopPropagation()}>
                <button className="stereo-guide-close" onClick={onClose}><X size={14} /></button>

                {step === 'edit' && (
                    <>
                        <h2 className="modal-title">Editar Grupo</h2>

                        {/* Name */}
                        <div className="group-modal-field">
                            <label className="group-modal-label">Nome do grupo</label>
                            <input
                                className="group-name-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Ex: Áudios de zuação"
                                maxLength={40}
                                autoFocus
                            />
                        </div>

                        {/* Hotkey */}
                        <div className="group-modal-field">
                            <label className="group-modal-label">Hotkey do grupo</label>
                            <div className="group-hotkey-row">
                                <span className={`hotkey-badge ${hotkey ? 'assigned' : 'unassigned'}`} style={{ cursor: 'default' }}>
                                    <Keyboard size={12} />
                                    <span>{hotkey ?? 'Nenhuma'}</span>
                                </span>
                                <button className="btn-secondary" onClick={() => { setStep('hotkey'); setListening(true) }}>
                                    {hotkey ? 'Alterar' : 'Definir hotkey'}
                                </button>
                                {hotkey && (
                                    <button className="btn-ghost" onClick={() => setHotkey(null)}>Remover</button>
                                )}
                            </div>
                        </div>

                        {/* Sounds in group */}
                        <div className="group-modal-field">
                            <label className="group-modal-label">Sons no grupo ({inGroup.length})</label>
                            {inGroup.length === 0 && (
                                <p className="group-empty-hint">Nenhum som adicionado ainda.</p>
                            )}
                            <div className="group-sound-list">
                                {inGroup.map(s => (
                                    <div key={s.id} className="group-sound-row">
                                        <button
                                            className={`preview-btn ${previewingId === s.id ? 'previewing' : ''}`}
                                            onClick={() => togglePreview(s)}
                                            title={previewingId === s.id ? 'Parar' : 'Ouvir'}
                                        >
                                            {previewingId === s.id ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                                        </button>
                                        <span className="group-sound-name">{s.name}</span>
                                        <button className="remove-btn" onClick={() => handleRemoveSound(s.id)} title="Remover do grupo">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Available sounds to add */}
                        {available.length > 0 && (
                            <div className="group-modal-field">
                                <label className="group-modal-label">Adicionar sons</label>
                                <div className="group-sound-list available">
                                    {available.map(s => (
                                        <div key={s.id} className="group-sound-row">
                                            <button
                                                className={`preview-btn ${previewingId === s.id ? 'previewing' : ''}`}
                                                onClick={() => togglePreview(s)}
                                                title={previewingId === s.id ? 'Parar' : 'Ouvir'}
                                            >
                                                {previewingId === s.id ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                                            </button>
                                            <span className="group-sound-name">{s.name}</span>
                                            <button className="add-btn" onClick={() => handleAddSound(s.id)} title="Adicionar ao grupo">
                                                <Plus size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn-ghost" onClick={onClose}>Cancelar</button>
                            <button className="btn-primary" onClick={handleSave}>Salvar grupo</button>
                        </div>
                    </>
                )}

                {step === 'hotkey' && (
                    <>
                        <h2 className="modal-title">Definir Hotkey</h2>
                        <p className="modal-subtitle">Pressione a combinação de teclas para o grupo <strong>{name || group.name}</strong></p>

                        <div
                            ref={captureRef}
                            className={`hotkey-capture-area ${listening ? 'listening' : ''} ${capturedKeys.length > 0 ? 'captured' : ''}`}
                            onClick={() => setListening(true)}
                        >
                            {listening && <div className="pulse-ring" />}
                            {capturedKeys.length > 0
                                ? <span className="captured-key">{formatKeys(capturedKeys)}</span>
                                : <span className="capture-hint">{listening ? 'Pressione as teclas…' : 'Clique para capturar'}</span>
                            }
                        </div>

                        <div className="modal-actions">
                            <button className="btn-ghost" onClick={() => { setStep('edit'); setCapturedKeys([]) }}>Voltar</button>
                            <button className="btn-primary" onClick={confirmHotkey} disabled={capturedKeys.length === 0}>
                                Confirmar
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
