'use client'

import React, { useEffect, useState } from 'react'
import { useField } from '@payloadcms/ui'
import AudioPlayer from './AudioPlayer'
import FrameLibrary from './FrameLibrary'
import FrameManager from './FrameManager'
import FramePreview from './FramePreview'
import type { MeditationFrameEditorProps, FrameData } from './types'
import type { Narrator, Frame } from '@/payload-types'

const MeditationFrameEditor: React.FC<MeditationFrameEditorProps> = ({
  path,
  label,
  description,
  required,
  readOnly,
}) => {
  const { value, setValue } = useField<FrameData[]>({ path })
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [narrator, setNarrator] = useState<Narrator | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)

  // Get the meditation's audio file and narrator from sibling fields
  const audioField = useField<string>({ path: 'filename' })
  const narratorField = useField<string>({ path: 'narrator' })

  useEffect(() => {
    const loadMeditationData = async () => {
      try {
        setIsLoading(true)
        
        // Get audio URL from the meditation's upload field
        if (audioField.value) {
          // In Payload, uploaded files have their URL accessible via the filename
          // For now, we'll construct a basic URL - this may need adjustment based on storage config
          const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : ''
          setAudioUrl(`${baseUrl}/media/meditations/${audioField.value}`)
        }

        // Load narrator data if narrator ID is available
        if (narratorField.value && typeof window !== 'undefined') {
          try {
            const response = await fetch(`/api/narrators/${narratorField.value}`)
            if (response.ok) {
              const narratorData = await response.json()
              setNarrator(narratorData)
            }
          } catch (error) {
            console.error('Failed to load narrator data:', error)
          }
        }
      } catch (error) {
        console.error('Failed to load meditation data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadMeditationData()
  }, [audioField.value, narratorField.value])

  // Initialize empty array if no value exists
  const frames = value || []

  const handleFramesChange = (newFrames: FrameData[]) => {
    // Sort frames by timestamp before saving
    const sortedFrames = [...newFrames].sort((a, b) => a.timestamp - b.timestamp)
    setValue(sortedFrames)
  }

  const handleTimeChange = (time: number) => {
    setCurrentTime(time)
  }

  const handleFrameSelect = (frame: Frame) => {
    const newFrameData: FrameData = {
      frame: frame.id,
      timestamp: currentTime,
    }

    // Apply first frame rule: if this is the first frame, set timestamp to 0
    if (frames.length === 0) {
      newFrameData.timestamp = 0
    }

    // Check for duplicate timestamp
    const existingFrameAtTime = frames.find(f => f.timestamp === newFrameData.timestamp)
    if (existingFrameAtTime) {
      const timeToShow = newFrameData.timestamp === 0 ? '0 (first frame rule)' : newFrameData.timestamp
      alert(`A frame already exists at ${timeToShow} seconds. Please choose a different time or remove the existing frame first.`)
      return
    }

    const newFrames = [...frames, newFrameData]
    handleFramesChange(newFrames)
  }

  if (isLoading) {
    return (
      <div className="field-type">
        <label className="field-label">
          {label || 'Meditation Frames'}
          {required && <span className="required">*</span>}
        </label>
        {description && <div className="field-description">{description}</div>}
        <div className="meditation-frame-editor loading">
          <div className="loading-message">Loading meditation data...</div>
        </div>
      </div>
    )
  }

  if (!audioUrl) {
    return (
      <div className="field-type">
        <label className="field-label">
          {label || 'Meditation Frames'}
          {required && <span className="required">*</span>}
        </label>
        {description && <div className="field-description">{description}</div>}
        <div className="meditation-frame-editor error">
          <div className="error-message">
            Please upload an audio file first to use the frame editor.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="field-type">
      <label className="field-label">
        {label || 'Meditation Frames'}
        {required && <span className="required">*</span>}
      </label>
      {description && <div className="field-description">{description}</div>}
      
      <div className="meditation-frame-editor" style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', backgroundColor: '#fafafa' }}>
        {/* Top Section: Audio Player and Live Preview */}
        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Audio Player Component */}
          <div className="audio-player-section" style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>Audio Player</h4>
            <AudioPlayer
              audioUrl={audioUrl}
              frames={frames}
              onTimeChange={handleTimeChange}
              onSeek={(time) => setCurrentTime(time)}
            />
          </div>

          {/* Live Preview */}
          <div className="frame-preview-section" style={{ flexShrink: 0 }}>
            <FramePreview
              frames={frames}
              currentTime={currentTime}
              width={250}
              height={188}
            />
          </div>
        </div>

        {/* Current Frames Manager */}
        <div className="frames-manager-section" style={{ marginBottom: '1.5rem' }}>
          <FrameManager
            frames={frames}
            onFramesChange={handleFramesChange}
            readOnly={readOnly}
          />
        </div>

        {/* Frame Library */}
        <div className="frame-library-section" style={{ marginBottom: '1.5rem' }}>
          <FrameLibrary
            narrator={narrator}
            onFrameSelect={handleFrameSelect}
            disabled={readOnly}
          />
          {narrator && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
              <strong>How to add frames:</strong> Click on any frame above to add it at the current audio time ({currentTime}s).
              {frames.length === 0 && ' Your first frame will automatically be set to 0 seconds.'}
            </div>
          )}
        </div>

        {/* Debug Info */}
        <div className="debug-info" style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '4px', fontSize: '0.875rem' }}>
          <strong>Debug Info:</strong>
          <br />Audio URL: {audioUrl}
          <br />Narrator: {narrator ? `${narrator.name} (${narrator.gender})` : 'Not loaded'}
          <br />Frames Count: {frames.length}
          <br />Current Time: {currentTime}s
        </div>
      </div>
    </div>
  )
}

export default MeditationFrameEditor