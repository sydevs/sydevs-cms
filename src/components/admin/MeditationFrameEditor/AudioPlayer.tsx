'use client'

import React, {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  useCallback,
  forwardRef,
} from 'react'
import type { KeyframeData } from './types'
import { getCurrentFrame, isVideoFile, getMediaUrl } from './utils'
import { SIZES } from './constants'
import {
  AudioPlayerContainer,
  AudioPreview,
  AudioPlayerOverlay,
  AudioPlayPauseButton,
  AudioProgressOverlay,
  AudioProgressBar,
  AudioProgressFill,
  AudioFrameMarker,
  AudioInfoText,
  AudioInfoLeft,
  AudioInfoRight,
  EmptyState,
} from './styled'

interface AudioPlayerProps {
  audioUrl: string | null
  frames: KeyframeData[]
  onTimeChange?: (time: number) => void
  onSeek?: (time: number) => void
  size?: 'small' | 'large'
  className?: string
  showPreview?: boolean
}

export interface AudioPlayerRef {
  pause: () => void
  seek: (time: number) => void
}

const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(
  (
    {
      audioUrl,
      frames,
      onTimeChange,
      onSeek,
      size = 'large',
      className = '',
      showPreview = false,
    },
    ref,
  ) => {
    const audioRef = useRef<HTMLAudioElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const currentBlobRef = useRef<string | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isLoaded, setIsLoaded] = useState(false)
    const [audioBlob, setAudioBlob] = useState<string | null>(null)
    const [loadingBlob, setLoadingBlob] = useState(false)
    const [isHovered, setIsHovered] = useState(false)

    // Size configurations
    const config = {
      small: {
        preview: SIZES.SMALL_PREVIEW,
        fontSize: '0.75rem',
      },
      large: {
        preview: SIZES.LARGE_PREVIEW,
        fontSize: '0.875rem',
      },
    }[size]

    // Find current frame
    const currentFrame = getCurrentFrame(frames, currentTime)
    const currentFrameIndex = currentFrame
      ? frames.findIndex((f) => f.id === currentFrame.id)
      : -1

    // Load audio as blob to enable proper seeking
    useEffect(() => {
      if (!audioUrl) {
        // Clean up previous blob URL if it exists
        if (currentBlobRef.current && currentBlobRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(currentBlobRef.current)
        }
        currentBlobRef.current = null
        setAudioBlob(null)
        setLoadingBlob(false)
        return
      }

      const loadAudioBlob = async () => {
        setLoadingBlob(true)
        try {
          const response = await fetch(audioUrl)
          if (!response.ok) throw new Error('Failed to load audio')

          const blob = await response.blob()
          const blobUrl = URL.createObjectURL(blob)

          // Clean up previous blob URL if it exists
          if (currentBlobRef.current && currentBlobRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(currentBlobRef.current)
          }

          currentBlobRef.current = blobUrl
          setAudioBlob(blobUrl)
        } catch (error) {
          console.warn('Failed to load audio as blob, using direct URL:', error)
          currentBlobRef.current = audioUrl
          setAudioBlob(audioUrl) // Fallback to direct URL
        } finally {
          setLoadingBlob(false)
        }
      }

      loadAudioBlob()
    }, [audioUrl])

    // Cleanup blob URL when component unmounts
    useEffect(() => {
      return () => {
        if (currentBlobRef.current && currentBlobRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(currentBlobRef.current)
        }
      }
    }, [])

    // Audio event handlers
    const handleLoadedMetadata = () => {
      if (audioRef.current) {
        setDuration(audioRef.current.duration)
        setIsLoaded(true)
      }
    }

    const handleTimeUpdate = () => {
      if (audioRef.current) {
        const time = audioRef.current.currentTime
        setCurrentTime(time)
        onTimeChange?.(time)
      }
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

    // Seeking with retry mechanism
    const seekTo = useCallback(
      async (newTime: number) => {
        if (!audioRef.current || !duration) return

        const clampedTime = Math.max(0, Math.min(newTime, duration))

        try {
          // Wait for audio to be ready if needed
          if (audioRef.current.readyState < 2) {
            await new Promise<void>((resolve) => {
              const handleCanPlay = () => {
                audioRef.current?.removeEventListener('canplay', handleCanPlay)
                resolve()
              }
              audioRef.current?.addEventListener('canplay', handleCanPlay)
            })
          }

          audioRef.current.currentTime = clampedTime
          setCurrentTime(clampedTime)
          onSeek?.(clampedTime)
        } catch (error) {
          console.warn('Seek failed:', error)
        }
      },
      [duration, onSeek],
    )

    // Expose pause and seek functions via ref
    useImperativeHandle(
      ref,
      () => ({
        pause: () => {
          if (audioRef.current && isPlaying) {
            audioRef.current.pause()
          }
        },
        seek: seekTo,
      }),
      [isPlaying, seekTo],
    )

    // Progress bar click handler
    const handleProgressClick = (e: React.MouseEvent) => {
      if (!progressRef.current || !duration) return

      const rect = progressRef.current.getBoundingClientRect()
      const percentage = (e.clientX - rect.left) / rect.width
      const newTime = percentage * duration
      seekTo(newTime)
    }

    // Frame marker click handler
    const handleMarkerClick = (timestamp: number, e: React.MouseEvent) => {
      e.stopPropagation()
      seekTo(timestamp)
    }

    // Toggle play/pause
    const togglePlayPause = useCallback(() => {
      if (!audioRef.current) return

      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
    }, [isPlaying])

    // Format time display
    const formatTime = (time: number) => {
      if (!isFinite(time)) return '0:00'
      const minutes = Math.floor(time / 60)
      const seconds = Math.floor(time % 60)
        .toString()
        .padStart(2, '0')
      return `${minutes}:${seconds}`
    }

    // Keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (!audioRef.current || !duration) return

        // Don't handle if user is typing in an input
        const target = event.target as Element
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

        switch (event.code) {
          case 'Space':
            event.preventDefault()
            togglePlayPause()
            break
          case 'ArrowLeft':
            event.preventDefault()
            seekTo(Math.max(0, currentTime - 5))
            break
          case 'ArrowRight':
            event.preventDefault()
            seekTo(Math.min(duration, currentTime + 5))
            break
        }
      }

      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }, [currentTime, duration, seekTo, togglePlayPause])

    if (!audioUrl) {
      return (
        <AudioPlayerContainer className={className} $width={config.preview}>
          <EmptyState $fontSize={config.fontSize}>No audio file uploaded</EmptyState>
        </AudioPlayerContainer>
      )
    }

    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

    return (
      <AudioPlayerContainer className={className} $width={config.preview}>
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={audioBlob || audioUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          preload="metadata"
        />

        {/* Square Preview with Overlay */}
        <AudioPreview
          $width={config.preview}
          $height={config.preview}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Frame Image/Video */}
          {showPreview && currentFrame ? (
            isVideoFile(currentFrame.mimeType || undefined) ? (
              <video
                src={currentFrame.url || ''}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                loop
                muted
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={getMediaUrl(currentFrame, 'medium') || undefined}
                alt={currentFrame.category}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )
          ) : (
            <div
              style={{
                textAlign: 'center',
                color: '#6c757d',
                fontSize: config.fontSize,
                padding: '1rem',
              }}
            >
              {frames.length === 0 ? 'No frames added' : 'Loading...'}
            </div>
          )}

          {/* Overlay with Controls */}
          <AudioPlayerOverlay $isHovered={isHovered}>
            {/* Center Play/Pause Button (visible on hover) */}
            <AudioPlayPauseButton
              type="button"
              onClick={togglePlayPause}
              disabled={!isLoaded || loadingBlob}
              $isHovered={isHovered}
              $isPlaying={isPlaying}
            >
              {loadingBlob ? '...' : isPlaying ? '⏸' : '▶'}
            </AudioPlayPauseButton>

            {/* Bottom Progress Bar with Gradient */}
            <AudioProgressOverlay>
              <AudioProgressBar ref={progressRef} onClick={handleProgressClick}>
                <AudioProgressFill $percentage={progressPercentage} />

                {/* Frame Markers */}
                {duration > 0 &&
                  frames.map((frame, index) => (
                    <AudioFrameMarker
                      key={`${frame.id}-${frame.timestamp}-${index}`}
                      $left={(frame.timestamp / duration) * 100}
                      onClick={(e) => handleMarkerClick(frame.timestamp, e)}
                      title={`Frame at ${frame.timestamp}s`}
                    />
                  ))}
              </AudioProgressBar>
            </AudioProgressOverlay>
          </AudioPlayerOverlay>
        </AudioPreview>

        {/* Info Text Below the Square */}
        <AudioInfoText>
          <AudioInfoLeft>
            {currentFrame && currentFrameIndex >= 0
              ? `${currentFrame.category} ${currentFrameIndex + 1}/${frames.length}`
              : frames.length > 0
                ? `Frame 1/${frames.length}`
                : 'No frames'}
          </AudioInfoLeft>
          <AudioInfoRight>
            {formatTime(currentTime)} / {formatTime(duration)}
          </AudioInfoRight>
        </AudioInfoText>
      </AudioPlayerContainer>
    )
  },
)

AudioPlayer.displayName = 'AudioPlayer'

export default AudioPlayer
