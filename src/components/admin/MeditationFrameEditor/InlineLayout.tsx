'use client'

import React, { useState, useRef, useCallback } from 'react'
import AudioPlayer, { type AudioPlayerRef } from './AudioPlayer'
import FrameLibrary from './FrameLibrary'
import FrameManager from './FrameManager'
import InstructionsPanel from './components/InstructionsPanel'
import type { KeyframeData } from './types'
import type { Narrator, Frame } from '@/payload-types'
import { pauseAllMedia, roundToNearestSecond } from './utils'
import { InlineContent, LeftColumn, MiddleColumn, RightColumn } from './styled'

interface InlineLayoutProps {
  audioUrl: string | null
  narrator: Narrator | null
  frames: KeyframeData[]
  onFramesChange: (frames: KeyframeData[]) => void
  readOnly?: boolean
}

const InlineLayout: React.FC<InlineLayoutProps> = ({
  audioUrl,
  narrator,
  frames,
  onFramesChange,
  readOnly = false,
}) => {
  const [currentTime, setCurrentTime] = useState(0)
  const audioPlayerRef = useRef<AudioPlayerRef>(null)

  const handleTimeChange = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  const handleFrameSelect = useCallback(
    (frame: Frame) => {
      const roundedTime = roundToNearestSecond(currentTime)

      const newKeyframeData: KeyframeData = {
        id: frame.id,
        timestamp: frames.length === 0 ? 0 : roundedTime,
      }

      // Check for existing frame at this timestamp and replace it
      const existingFrameIndex = frames.findIndex((f) => f.timestamp === newKeyframeData.timestamp)

      const newFrames: KeyframeData[] =
        existingFrameIndex !== -1
          ? frames.map((f, index) => (index === existingFrameIndex ? newKeyframeData : f))
          : [...frames, newKeyframeData]

      onFramesChange(newFrames)
    },
    [currentTime, frames, onFramesChange],
  )

  return (
    <InlineContent>
      {/* Left Column - Audio Preview */}
      <LeftColumn>
        <AudioPlayer
          ref={audioPlayerRef}
          audioUrl={audioUrl}
          frames={frames}
          onTimeChange={handleTimeChange}
          onSeek={setCurrentTime}
          size="large"
          enableHotkeys={true}
          showPreview={true}
        />

        <InstructionsPanel narrator={narrator} currentTime={currentTime} frames={frames} />

        {/* Spacer */}
        <div style={{ flex: 1 }} />
      </LeftColumn>

      {/* Middle Column - Frame Library */}
      <MiddleColumn>
        <FrameLibrary narrator={narrator} onFrameSelect={handleFrameSelect} disabled={readOnly} />
      </MiddleColumn>

      {/* Right Column - Current Frames */}
      <RightColumn>
        <FrameManager frames={frames} onFramesChange={onFramesChange} readOnly={readOnly} />
      </RightColumn>
    </InlineContent>
  )
}

export default InlineLayout
