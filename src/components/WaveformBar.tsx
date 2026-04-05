import React, { useEffect, useRef, useState } from 'react'

interface WaveformBarProps {
  waveform?: number[]
  duration?: number
  progress?: number  // 0-1, for playback progress animation
  isPlaying?: boolean
  width?: number
  height?: number
  className?: string
}

export function WaveformBar({
  waveform,
  duration = 0,
  progress = 0,
  isPlaying = false,
  width = 140,
  height = 32,
  className = '',
}: WaveformBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  const barCount = Math.min(waveform?.length ?? 0, 40)
  const barWidth = barCount > 0 ? width / barCount : 0
  const barGap = 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = width
    canvas.height = height

    // Clear canvas
    ctx.fillStyle = 'transparent'
    ctx.fillRect(0, 0, width, height)

    if (!waveform || waveform.length === 0) {
      ctx.fillStyle = 'rgba(150, 150, 150, 0.3)'
      ctx.fillRect(0, height / 2 - 1, width, 2)
      return
    }

    const centerY = height / 2
    const maxBarHeight = height * 0.8

    for (let i = 0; i < barCount; i++) {
      const amplitude = waveform[i] ?? 0
      const barHeight = amplitude * maxBarHeight

      const progressX = progress * width

      // Determine color based on progress
      let fillColor: string
      if (i * barWidth < progressX) {
        // Filled portion (accent color)
        fillColor = 'rgba(59, 130, 246, 0.9)' // blue-500
      } else {
        // Unfilled portion (muted color)
        fillColor = 'rgba(100, 116, 139, 0.5)' // slate-500 muted
      }

      ctx.fillStyle = fillColor
      ctx.fillRect(
        i * barWidth + barGap / 2,
        centerY - barHeight / 2,
        barWidth - barGap,
        barHeight
      )
    }
  }, [waveform, progress, width, height, barCount])

  return (
    <div className={`waveform-bar ${className}`}>
      <canvas
        ref={canvasRef}
        className={`waveform-canvas ${isPlaying ? 'playing' : ''}`}
      />
      {duration > 0 && (
        <span className="waveform-duration">
          {formatTime(duration)}
        </span>
      )}
    </div>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
