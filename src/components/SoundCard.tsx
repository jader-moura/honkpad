import React from 'react'
import { Play, Square, Keyboard, Trash2, Volume2 } from 'lucide-react'
import { SoundEntry } from '../types/global'

interface SoundCardProps {
  sound: SoundEntry
  onPlay: (id: string) => void
  onStop: () => void
  onRemove: (id: string) => void
  onHotkeyClick: (id: string) => void
  isPlaying: boolean
}

export function SoundCard({ sound, onPlay, onStop, onRemove, onHotkeyClick, isPlaying }: SoundCardProps) {
  return (
    <div className={`sound-card ${isPlaying ? 'playing' : ''}`}>
      {isPlaying && <div className="playing-bar" />}

      <div className="sound-card-name" title={sound.name}>
        <Volume2 size={14} className="sound-icon" />
        <span>{sound.name}</span>
      </div>

      <button
        className={`play-btn ${isPlaying ? 'playing' : ''}`}
        onClick={() => isPlaying ? onStop() : onPlay(sound.id)}
        title={isPlaying ? 'Parar' : 'Reproduzir'}
      >
        {isPlaying
          ? <Square size={20} fill="currentColor" />
          : <Play size={22} fill="currentColor" />
        }
      </button>

      <div className="sound-card-footer">
        <button
          className={`hotkey-badge ${sound.hotkey ? 'assigned' : 'unassigned'}`}
          onClick={() => onHotkeyClick(sound.id)}
          title="Configurar hotkey"
        >
          <Keyboard size={12} />
          <span>{sound.hotkey ?? 'Sem hotkey'}</span>
        </button>

        <button className="remove-btn" onClick={() => onRemove(sound.id)} title="Remover">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
