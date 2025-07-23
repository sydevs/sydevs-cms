'use client'

import React, { useState } from 'react'
import { FullscreenModal, useModal } from '@payloadcms/ui'
import AudioPreviewPlayer from './AudioPreviewPlayer'
import FrameLibrary from './FrameLibrary'
import FrameManager from './FrameManager'
import type { FrameData } from './types'
import type { Narrator, Frame } from '@/payload-types'

interface MeditationFrameEditorModalProps {
  initialFrames: FrameData[]
  audioUrl: string | null
  narrator: Narrator | null
  onSave: (frames: FrameData[]) => void
  readOnly?: boolean
}

const MODAL_SLUG = 'meditation-frame-editor'

const MeditationFrameEditorModal: React.FC<MeditationFrameEditorModalProps> = ({
  initialFrames,
  audioUrl,
  narrator,
  onSave,
  readOnly = false,
}) => {
  const { openModal, closeModal } = useModal()
  const [tempFrames, setTempFrames] = useState<FrameData[]>(initialFrames)
  const [currentTime, setCurrentTime] = useState(0)

  const handleOpenModal = () => {
    // Reset temp state to current saved state when opening
    setTempFrames([...initialFrames])
    setCurrentTime(0)
    openModal(MODAL_SLUG)
  }

  const handleSave = () => {
    onSave([...tempFrames])
    closeModal(MODAL_SLUG)
  }

  const handleCancel = () => {
    // Reset temp state and close without saving
    setTempFrames([...initialFrames])
    closeModal(MODAL_SLUG)
  }

  const handleFramesChange = (newFrames: FrameData[]) => {
    setTempFrames(newFrames)
  }

  const handleTimeChange = (time: number) => {
    setCurrentTime(time)
  }

  const handleFrameSelect = (frame: Frame) => {
    // Round timestamp to nearest second
    const roundedTime = Math.round(currentTime)
    
    const newFrameData: FrameData = {
      frame: frame.id,
      timestamp: roundedTime,
    }

    // Apply first frame rule: if this is the first frame, set timestamp to 0
    if (tempFrames.length === 0) {
      newFrameData.timestamp = 0
    }

    // Check for existing frame at this timestamp and replace it
    const existingFrameIndex = tempFrames.findIndex(f => f.timestamp === newFrameData.timestamp)
    
    let newFrames: FrameData[]
    if (existingFrameIndex !== -1) {
      // Replace existing frame at this timestamp
      newFrames = [...tempFrames]
      newFrames[existingFrameIndex] = newFrameData
    } else {
      // Add new frame
      newFrames = [...tempFrames, newFrameData]
    }
    
    handleFramesChange(newFrames)
  }

  return (
    <>
      {/* Collapsed State */}
      <div className="meditation-frame-editor-collapsed" style={{ 
        display: 'flex', 
        gap: '1rem', 
        alignItems: 'flex-start',
        padding: '1rem',
        border: '1px solid #e0e0e0', 
        borderRadius: '8px', 
        backgroundColor: '#fafafa' 
      }}>
        {/* Unified Audio Preview Player */}
        <AudioPreviewPlayer
          audioUrl={audioUrl}
          frames={initialFrames}
          size="small"
        />

        {/* Edit Button and Info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.5rem' }}>
          <button
            type="button"
            onClick={handleOpenModal}
            disabled={!audioUrl || readOnly}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: !audioUrl || readOnly ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: !audioUrl || readOnly ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              alignSelf: 'flex-start',
            }}
          >
            Edit Video
          </button>
          
          {!audioUrl && (
            <div style={{ fontSize: '0.75rem', color: '#666' }}>
              Please upload an audio file first to edit frames.
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <FullscreenModal slug={MODAL_SLUG} className="meditation-frame-editor-modal">
        {/* Modal Header */}
        <div style={{ 
          padding: '1.5rem 1.5rem 1rem 1.5rem', 
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#fff'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
            Edit Video Frames
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Save
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          gap: '1.5rem', 
          padding: '1.5rem',
          overflow: 'hidden',
          backgroundColor: '#fff',
          height: 'calc(100vh - 120px)'
        }}>
          {/* Left Column */}
          <div style={{ 
            flex: '0 0 350px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '1.5rem',
            overflow: 'hidden'
          }}>
            {/* Unified Audio Preview Player */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <AudioPreviewPlayer
                audioUrl={audioUrl}
                frames={tempFrames}
                onTimeChange={handleTimeChange}
                onSeek={(time) => setCurrentTime(time)}
                size="large"
              />
            </div>

            {/* Current Frames */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <FrameManager
                frames={tempFrames}
                onFramesChange={handleFramesChange}
                readOnly={readOnly}
              />
            </div>
          </div>

          {/* Right Column - Frame Library */}
          <div style={{ 
            flex: 1, 
            overflow: 'hidden'
          }}>
            <FrameLibrary
              narrator={narrator}
              onFrameSelect={handleFrameSelect}
              disabled={readOnly}
            />
            {narrator && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                <strong>How to add frames:</strong> Click on any frame above to add it at the current audio time ({Math.round(currentTime)}s).
                {tempFrames.length === 0 && ' Your first frame will automatically be set to 0 seconds.'}
              </div>
            )}
          </div>
        </div>
      </FullscreenModal>
    </>
  )
}

export default MeditationFrameEditorModal