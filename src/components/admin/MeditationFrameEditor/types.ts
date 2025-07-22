export interface FrameData {
  frame: string // Relationship ID to frames collection
  timestamp: number // Time in seconds
}

export interface MeditationFrame {
  id: string
  name: string
  filename: string
  url?: string
  mimeType?: string
  imageSet: 'male' | 'female'
  tags?: Array<{ id: string; name: string }>
  dimensions?: {
    width: number
    height: number
  }
  duration?: number // For video frames
}

export interface Narrator {
  id: string
  name: string
  gender: 'male' | 'female'
}

export interface AudioPlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  isLoaded: boolean
  isLoading: boolean
}

export interface MeditationFrameEditorProps {
  path: string
  label?: string
  description?: string
  required?: boolean
  readOnly?: boolean
}