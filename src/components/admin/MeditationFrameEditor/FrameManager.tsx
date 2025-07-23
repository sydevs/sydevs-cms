'use client'

import React, { useState, useEffect } from 'react'
import type { FrameData } from './types'
import type { Frame } from '@/payload-types'

interface FrameManagerProps {
  frames: FrameData[]
  onFramesChange: (frames: FrameData[]) => void
  readOnly?: boolean
}

const FrameManager: React.FC<FrameManagerProps> = ({
  frames,
  onFramesChange,
  readOnly = false,
}) => {
  const [frameDetails, setFrameDetails] = useState<{ [key: string]: Frame }>({})
  const [isLoading, setIsLoading] = useState(false)

  // Load frame details for display
  useEffect(() => {
    const loadFrameDetails = async () => {
      const frameIds = frames.map(f => f.frame)
      const missingIds = frameIds.filter(id => !frameDetails[id])
      
      if (missingIds.length === 0) return

      setIsLoading(true)
      try {
        // Load frame details in batches
        const promises = missingIds.map(async (id) => {
          try {
            const response = await fetch(`/api/frames/${id}`)
            if (response.ok) {
              const frame = await response.json()
              return { id, frame }
            }
          } catch (error) {
            console.error(`Failed to load frame ${id}:`, error)
          }
          return null
        })

        const results = await Promise.all(promises)
        const newFrameDetails = { ...frameDetails }
        
        results.forEach(result => {
          if (result) {
            newFrameDetails[result.id] = result.frame
          }
        })
        
        setFrameDetails(newFrameDetails)
      } catch (error) {
        console.error('Failed to load frame details:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadFrameDetails()
  }, [frames, frameDetails])

  const handleTimestampChange = (index: number, newTimestamp: number) => {
    const updatedFrames = [...frames]
    updatedFrames[index] = { ...updatedFrames[index], timestamp: newTimestamp }
    
    // Sort frames by timestamp
    const sortedFrames = updatedFrames.sort((a, b) => a.timestamp - b.timestamp)
    onFramesChange(sortedFrames)
  }

  const handleRemoveFrame = (index: number) => {
    const updatedFrames = frames.filter((_, i) => i !== index)
    onFramesChange(updatedFrames)
  }

  const validateTimestamp = (timestamp: number, currentIndex: number): string | null => {
    if (timestamp < 0) return 'Timestamp must be 0 or greater'
    if (!Number.isInteger(timestamp)) return 'Timestamp must be a whole number'
    
    // Check for duplicates (excluding current frame)
    const otherFrames = frames.filter((_, index) => index !== currentIndex)
    if (otherFrames.some(f => f.timestamp === timestamp)) {
      return `Timestamp ${timestamp}s is already used by another frame`
    }
    
    return null
  }

  if (frames.length === 0) {
    return (
      <div className="frame-manager">
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>
          Current Frames (0)
        </h4>
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center', 
          backgroundColor: '#f8f9fa', 
          border: '1px dashed #ccc', 
          borderRadius: '4px',
          color: '#666'
        }}>
          No frames added yet. Select frames from the library below to add them at the current audio timestamp.
        </div>
      </div>
    )
  }

  return (
    <div className="frame-manager">
      <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>
        Current Frames ({frames.length})
      </h4>
      
      <div className="frames-list" style={{ 
        backgroundColor: '#fff', 
        border: '1px solid #e0e0e0', 
        borderRadius: '4px',
        maxHeight: '300px',
        overflowY: 'auto'
      }}>
        {frames.map((frameData, index) => {
          const frame = frameDetails[frameData.frame]
          
          return (
            <div
              key={`${frameData.frame}-${frameData.timestamp}-${index}`}
              className="frame-item"
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                padding: '1rem', 
                borderBottom: index < frames.length - 1 ? '1px solid #e0e0e0' : 'none',
                gap: '1rem'
              }}
            >
              {/* Frame Preview */}
              <div style={{ 
                width: '60px', 
                height: '45px', 
                backgroundColor: '#f0f0f0', 
                borderRadius: '4px',
                overflow: 'hidden',
                flexShrink: 0,
                position: 'relative'
              }}>
                {frame?.url ? (
                  frame.mimeType?.startsWith('video/') ? (
                    <video
                      src={frame.url}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      muted
                    />
                  ) : (
                    <img
                      src={frame.url}
                      alt={frame.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )
                ) : (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#999',
                    fontSize: '0.625rem'
                  }}>
                    {isLoading ? '...' : 'N/A'}
                  </div>
                )}
              </div>

              {/* Frame Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                  {frame?.name || `Frame ${frameData.frame}`}
                </div>
                {frame?.mimeType?.startsWith('video/') && frame.duration && (
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    {frame.duration}s video
                  </div>
                )}
              </div>

              {/* Timestamp Input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', color: '#666', minWidth: '40px' }}>
                  Time:
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={frameData.timestamp}
                  onChange={(e) => {
                    const newTimestamp = parseInt(e.target.value) || 0
                    const error = validateTimestamp(newTimestamp, index)
                    if (!error) {
                      handleTimestampChange(index, newTimestamp)
                    }
                  }}
                  disabled={readOnly}
                  style={{
                    width: '60px',
                    padding: '0.25rem',
                    border: '1px solid #ddd',
                    borderRadius: '3px',
                    fontSize: '0.75rem',
                    textAlign: 'center'
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#666' }}>s</span>
              </div>

              {/* Remove Button */}
              <button
                type="button"
                onClick={() => handleRemoveFrame(index)}
                disabled={readOnly}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: readOnly ? '#ccc' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: readOnly ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  flexShrink: 0
                }}
                title="Remove frame"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div style={{ 
        marginTop: '0.5rem', 
        fontSize: '0.75rem', 
        color: '#666',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>
          {frames.length} frame{frames.length !== 1 ? 's' : ''}
        </span>
        <span>
          Duration: 0s - {Math.max(...frames.map(f => f.timestamp), 0)}s
        </span>
      </div>
    </div>
  )
}

export default FrameManager