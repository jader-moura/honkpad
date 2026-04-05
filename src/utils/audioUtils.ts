/**
 * Audio utility functions for decoding, waveform extraction, and playback tracking
 */

export interface WaveformData {
  waveform: Float32Array
  duration: number
}

/**
 * Decode audio file and extract waveform data
 * @param filePath - Absolute file path to audio file
 * @param samples - Number of samples to downsample to (default 100)
 */
export async function decodeAudioWaveform(filePath: string, samples: number = 100): Promise<WaveformData> {
  try {
    // Convert file path to file:// URL
    const normalized = filePath.replace(/\\/g, '/')
    const url = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`

    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    // Extract waveform by downsampling
    const rawData = audioBuffer.getChannelData(0) // Get first channel
    const blockSize = Math.floor(rawData.length / samples)
    const filteredData = new Float32Array(samples)

    for (let i = 0; i < samples; i++) {
      let sum = 0
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[i * blockSize + j])
      }
      filteredData[i] = sum / blockSize
    }

    return {
      waveform: filteredData,
      duration: audioBuffer.duration,
    }
  } catch (error) {
    console.error('[audioUtils] Failed to decode waveform:', error)
    // Return empty waveform on error
    return {
      waveform: new Float32Array(100),
      duration: 0,
    }
  }
}

/**
 * Get the playback position as a percentage (0-1)
 * @param audioElement - HTML audio element
 */
export function getPlaybackProgress(audioElement: HTMLAudioElement): number {
  if (!audioElement || !audioElement.duration) return 0
  return audioElement.currentTime / audioElement.duration
}

/**
 * Get amplitude at a specific progress point in the waveform
 */
export function getWaveformAmplitudeAt(waveform: Float32Array | undefined, progress: number): number {
  if (!waveform || waveform.length === 0) return 0
  const index = Math.floor(progress * (waveform.length - 1))
  return Math.max(0, Math.min(1, waveform[Math.floor(index)]))
}
