import type { Frame } from '@/payload-types'

// Types that are not defined in payload-types.ts
export type FrameData = {
  frame: string // Relationship ID to frames collection
  timestamp: number // Time in seconds
} & Pick<
  Frame,
  | 'url'
  | 'duration'
  | 'previewUrl'
  | 'sizes'
  | 'category'
  | 'mimeType'
  | 'width'
  | 'height'
  | 'tags'
>

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
