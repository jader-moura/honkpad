import React from 'react'
import { Play, Keyboard, Trash2, Edit2, Shuffle, Music } from 'lucide-react'
import { SoundGroup, SoundEntry } from '../types/global'

interface GroupCardProps {
    group: SoundGroup
    sounds: SoundEntry[]   // full sound list to resolve names
    onPlayRandom: (groupId: string) => void
    onEdit: (groupId: string) => void
    onRemove: (groupId: string) => void
    isPlaying: boolean
}

export function GroupCard({ group, sounds, onPlayRandom, onEdit, onRemove, isPlaying }: GroupCardProps) {
    const groupSounds = sounds.filter(s => group.soundIds.includes(s.id))
    const count = groupSounds.length

    return (
        <div className={`sound-card group-card ${isPlaying ? 'playing' : ''}`}>
            {isPlaying && <div className="playing-bar" />}

            {/* Group badge */}
            <div className="group-badge">
                <Shuffle size={11} />
                Grupo · {count} {count === 1 ? 'som' : 'sons'}
            </div>

            <div className="sound-card-name" title={group.name}>
                <Music size={14} className="sound-icon" />
                <span>{group.name}</span>
            </div>

            {/* Mini preview of sounds in group */}
            {count > 0 && (
                <div className="group-sounds-preview">
                    {groupSounds.slice(0, 3).map(s => (
                        <span key={s.id} className="group-sound-chip">{s.name}</span>
                    ))}
                    {count > 3 && <span className="group-sound-chip muted">+{count - 3} mais</span>}
                </div>
            )}

            {count === 0 && (
                <p className="group-empty-hint">Nenhum som adicionado</p>
            )}

            <button
                className={`play-btn ${isPlaying ? 'playing' : ''}`}
                onClick={() => onPlayRandom(group.id)}
                title="Reproduzir som aleatório do grupo"
                disabled={count === 0}
            >
                <Shuffle size={20} />
            </button>

            <div className="sound-card-footer">
                <button
                    className={`hotkey-badge ${group.hotkey ? 'assigned' : 'unassigned'}`}
                    onClick={() => onEdit(group.id)}
                    title="Editar grupo"
                >
                    <Keyboard size={12} />
                    <span>{group.hotkey ?? 'Sem hotkey'}</span>
                </button>

                <div className="group-actions">
                    <button className="edit-btn" onClick={() => onEdit(group.id)} title="Editar grupo">
                        <Edit2 size={13} />
                    </button>
                    <button className="remove-btn" onClick={() => onRemove(group.id)} title="Remover grupo">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    )
}
