'use client'

import React, { useEffect, useState } from 'react'
import { useField } from '@payloadcms/ui'
import AudioPlayer from './AudioPlayer'
import type { MeditationFrameEditorProps, FrameData } from './types'
import type { Narrator } from '@/payload-types'

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

  const handleAddFrameAtCurrentTime = () => {
    // For now, add a placeholder frame - this will be replaced with actual frame selection in Phase 2
    const newFrame: FrameData = {
      frame: 'placeholder-frame-id',
      timestamp: currentTime,
    }

    // Check for duplicate timestamp
    const existingFrameAtTime = frames.find(f => f.timestamp === currentTime)
    if (existingFrameAtTime) {
      alert(`A frame already exists at ${currentTime} seconds. Please choose a different time.`)
      return
    }

    // Apply first frame rule: if this is the first frame, set timestamp to 0
    if (frames.length === 0) {
      newFrame.timestamp = 0
    }

    const newFrames = [...frames, newFrame]
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
        {/* Audio Player Component */}
        <div className="audio-player-section" style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>Audio Player</h4>
          <AudioPlayer
            audioUrl={audioUrl}
            frames={frames}
            onTimeChange={handleTimeChange}
            onSeek={(time) => setCurrentTime(time)}
          />
        </div>

        {/* Frame Management Controls */}
        <div className="frame-controls-section" style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>Frame Management</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={handleAddFrameAtCurrentTime}
              disabled={readOnly}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: readOnly ? '#ccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: readOnly ? 'not-allowed' : 'pointer',
              }}
            >
              Add Frame at {currentTime}s
              {frames.length === 0 && ' (will be set to 0s as first frame)'}
            </button>
          </div>
        </div>

        {/* Current Frames List */}
        <div className="frames-list-section">
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>Current Frames ({frames.length})</h4>
          {frames.length === 0 ? (
            <div className="no-frames" style={{ padding: '1rem', backgroundColor: '#fff', border: '1px dashed #ccc', borderRadius: '4px', textAlign: 'center', color: '#666' }}>
              No frames added yet. Use the audio player to navigate to a timestamp and click &quot;Add Frame&quot;.
            </div>
          ) : (
            <div className="frames-list" style={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
              {frames.map((frame, index) => (
                <div key={`${frame.frame}-${frame.timestamp}`} className="frame-item" style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '0.75rem 1rem', 
                  borderBottom: index < frames.length - 1 ? '1px solid #e0e0e0' : 'none' 
                }}>
                  <span className="frame-info" style={{ fontFamily: 'monospace' }}>
                    Frame {index + 1}: {frame.timestamp}s
                    {frame.frame === 'placeholder-frame-id' && ' (placeholder)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const newFrames = frames.filter((_, i) => i !== index)
                      handleFramesChange(newFrames)
                    }}
                    className="delete-frame-btn"
                    disabled={readOnly}
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: readOnly ? '#ccc' : '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: readOnly ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
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