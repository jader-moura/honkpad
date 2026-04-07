import React, { useEffect, useRef, useState } from 'react'
import { X, Plus, Trash2, Keyboard, Play, Square, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
    const { t } = useTranslation()
    const [name, setName] = useState(group.name)
    const [soundIds, setSoundIds] = useState<string[]>(group.soundIds)
    const [hotkey, setHotkey] = useState<string | null>(group.hotkey)
    const [step, setStep] = useState<ModalStep>('edit')
    const [availableSearch, setAvailableSearch] = useState('')

    // Hotkey capture state
    const [listening, setListening] = useState(false)
    const [capturedKeys, setCapturedKeys] = useState<string[]>([])
    const captureRef = useRef<HTMLDivElement>(null)

    // Sounds not yet in group
    const available = allSounds.filter(s => !soundIds.includes(s.id))
    const filteredAvailable = available.filter(s =>
        s.name.toLowerCase().includes(availableSearch.toLowerCase())
    )
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
                        <h2 className="modal-title">{t('group.editTitle')}</h2>

                        {/* Name */}
                        <div className="group-modal-field">
                            <label className="group-modal-label">{t('group.groupName')}</label>
                            <input
                                className="group-name-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder={t('group.namePlaceholder')}
                                maxLength={40}
                                autoFocus
                            />
                        </div>

                        {/* Hotkey */}
                        <div className="group-modal-field">
                            <label className="group-modal-label">{t('group.hotkeyLabel')}</label>
                            <div className="group-hotkey-row">
                                <span className={`hotkey-badge ${hotkey ? 'assigned' : 'unassigned'}`} style={{ cursor: 'default' }}>
                                    <Keyboard size={12} />
                                    <span>{hotkey ?? t('hotkey.unassigned')}</span>
                                </span>
                                <button className="btn-secondary" onClick={() => { setStep('hotkey'); setListening(true) }}>
                                    {hotkey ? t('button.change') : t('button.setHotkey')}
                                </button>
                                {hotkey && (
                                    <button className="btn-ghost" onClick={() => setHotkey(null)}>{t('button.remove')}</button>
                                )}
                            </div>
                        </div>

                        {/* Sounds in group */}
                        <div className="group-modal-field">
                            <label className="group-modal-label">{t('group.soundsInGroup', { count: inGroup.length })}</label>
                            {inGroup.length === 0 && (
                                <p className="group-empty-hint">{t('group.noSoundsAddedYet')}</p>
                            )}
                            <div className="group-sound-list">
                                {inGroup.map(s => (
                                    <div key={s.id} className="group-sound-row">
                                        <button
                                            className={`preview-btn ${previewingId === s.id ? 'previewing' : ''}`}
                                            onClick={() => togglePreview(s)}
                                            title={previewingId === s.id ? t('group.previewStop') : t('group.previewPlay')}
                                        >
                                            {previewingId === s.id ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                                        </button>
                                        <span className="group-sound-name">{s.name}</span>
                                        <button className="remove-btn" onClick={() => handleRemoveSound(s.id)} title={t('group.removeFromGroup')}>
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Available sounds to add */}
                        {available.length > 0 && (
                            <div className="group-modal-field">
                                <label className="group-modal-label">{t('group.addSounds')}</label>
                                <div className="search-box">
                                    <Search size={13} className="search-icon" />
                                    <input
                                        className="search-input"
                                        placeholder={t('search.placeholder')}
                                        value={availableSearch}
                                        onChange={e => setAvailableSearch(e.target.value)}
                                    />
                                </div>
                                <div className="group-sound-list available">
                                    {filteredAvailable.length > 0
                                        ? filteredAvailable.map(s => (
                                            <div key={s.id} className="group-sound-row">
                                                <button
                                                    className={`preview-btn ${previewingId === s.id ? 'previewing' : ''}`}
                                                    onClick={() => togglePreview(s)}
                                                    title={previewingId === s.id ? t('group.previewStop') : t('group.previewPlay')}
                                                >
                                                    {previewingId === s.id ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                                                </button>
                                                <span className="group-sound-name">{s.name}</span>
                                                <button className="add-btn" onClick={() => handleAddSound(s.id)} title={t('group.addToGroup')}>
                                                    <Plus size={13} />
                                                </button>
                                            </div>
                                        ))
                                        : <p className="group-empty-hint">{t('group.noSoundsFound')}</p>
                                    }
                                </div>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn-ghost" onClick={onClose}>{t('button.cancel')}</button>
                            <button className="btn-primary" onClick={handleSave}>{t('group.saveGroup')}</button>
                        </div>
                    </>
                )}

                {step === 'hotkey' && (
                    <>
                        <h2 className="modal-title">{t('group.setHotkey')}</h2>
                        <p className="modal-subtitle">{t('group.pressKeysForGroup')} <strong>{name || group.name}</strong></p>

                        <div
                            ref={captureRef}
                            className={`hotkey-capture-area ${listening ? 'listening' : ''} ${capturedKeys.length > 0 ? 'captured' : ''}`}
                            onClick={() => setListening(true)}
                        >
                            {listening && <div className="pulse-ring" />}
                            {capturedKeys.length > 0
                                ? <span className="captured-key">{formatKeys(capturedKeys)}</span>
                                : <span className="capture-hint">{listening ? t('group.pressKeys') : t('group.clickToCapture')}</span>
                            }
                        </div>

                        <div className="modal-actions">
                            <button className="btn-ghost" onClick={() => { setStep('edit'); setCapturedKeys([]) }}>{t('group.back')}</button>
                            <button className="btn-primary" onClick={confirmHotkey} disabled={capturedKeys.length === 0}>
                                {t('button.confirm')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
