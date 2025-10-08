import styled, { css } from 'styled-components'
import { COLORS, GRID_CONFIG } from './constants'

// Inline Content Container
export const InlineContent = styled.div`
  display: flex;
  gap: 1rem;
  padding: 0;
  overflow: hidden;
  min-height: 600px;
`

// Layout Columns (Two-column layout)
export const LeftColumn = styled.div`
  flex: 0 0 350px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow: hidden;
  height: 100%;
`

export const RightColumn = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow: hidden;
  height: 100%;
`


// Button Styles (kept for FrameManager delete functionality)
const buttonBase = css`
  border: none;
  border-radius: var(--style-radius-m);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.2s;

  &:disabled {
    cursor: not-allowed;
  }
`

export const Button = styled.button<{
  variant?: 'primary' | 'secondary' | 'error'
}>`
  ${buttonBase}
  padding: 0.5rem 1rem;

  ${(props) => {
    switch (props.variant) {
      case 'primary':
        return css`
          background-color: ${COLORS.SUCCESS};
          color: white;
        `
      case 'secondary':
        return css`
          background-color: ${COLORS.ELEVATION_200};
          color: ${COLORS.TEXT};
        `
      case 'error':
        return css`
          background-color: ${COLORS.ERROR};
          color: white;
        `
      default:
        return css`
          background-color: ${COLORS.ELEVATION_200};
          color: ${COLORS.TEXT};
        `
    }
  }}
`

// Audio Player Components
export const AudioPlayerContainer = styled.div<{ $width: number }>`
  background-color: #f8f9fa;
  border-radius: 8px;
  overflow: hidden;
  width: ${(props) => props.$width}px;
  border: 1px solid #e0e0e0;
`

export const AudioPreview = styled.div<{ $width: number; $height: number }>`
  width: ${(props) => props.$width}px;
  height: ${(props) => props.$height}px;
  background-color: #f0f0f0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
`

export const AudioControls = styled.div`
  background-color: #ffffff;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  gap: 1em;
  border-top: 1px solid #e0e0e0;
`

export const AudioControlsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`

export const PlayButton = styled.button<{ $size: number; $fontSize: string }>`
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  font-size: ${(props) => props.$fontSize};
  border-radius: 50%;
  background-color: #007bff;
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;

  &:hover {
    background-color: #0056b3;
  }

  &:disabled {
    background-color: ${COLORS.ELEVATION_200};
    color: ${COLORS.ELEVATION_600};
    cursor: not-allowed;
  }
`

export const TimeDisplay = styled.div<{ $fontSize: string }>`
  color: #495057;
  font-size: ${(props) => props.$fontSize};
  font-family: monospace;
`

export const ProgressBar = styled.div<{ $height: number }>`
  position: relative;
  width: 100%;
  height: ${(props) => props.$height}px;
  background-color: #e9ecef;
  border-radius: 3px;
  cursor: pointer;
  margin: 1em 0;
  overflow: visible;
`

export const ProgressFill = styled.div<{ $width: number; $transition?: boolean }>`
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: ${(props) => props.$width}%;
  transition: ${(props) => (props.$transition ? 'width 0.1s' : 'none')};
  background-color: #007bff;
  border-radius: 3px;
`

export const ProgressPlayhead = styled.div<{ $left: number; $size: number; $transition?: boolean }>`
  position: absolute;
  left: ${(props) => props.$left}%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  transition: ${(props) => (props.$transition ? 'left 0.1s' : 'none')};
  border-radius: 50%;
  background-color: #ffffff;
  border: 2px solid #007bff;
  pointer-events: none;
  // transition handled by the $transition prop above
`

export const AudioPlayerWrapper = styled.div`
  position: relative;
  width: 100%;
`

export const FrameMarkersOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;

  /* Target the progress bar area of react-h5-audio-player */
  & > div {
    pointer-events: auto;
  }
`

export const FrameMarker = styled.div<{ $left: number }>`
  position: absolute;
  left: ${(props) => props.$left}%;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  background-color: #f97316;
  opacity: 0.85;
  cursor: pointer;
  pointer-events: auto;
  transition:
    opacity 0.2s,
    transform 0.2s;

  &:hover {
    opacity: 1;
    transform: translateY(-50%) scale(1.2);
  }

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 16px;
    height: 32px;
    cursor: pointer;
  }
`

// Instructions Panel
export const InstructionsPanel = styled.div`
  font-size: 0.7rem;
  color: ${COLORS.ELEVATION_600};
  text-align: left;
  padding: 0.75rem;
  background-color: ${COLORS.ELEVATION_50};
  border-radius: var(--style-radius-m);
  border: 1px solid ${COLORS.BORDER};
  flex-shrink: 0;
`

export const InstructionsTitle = styled.div`
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: ${COLORS.TEXT};
`

// State Components
export const LoadingState = styled.div`
  padding: 2rem;
  text-align: center;
  background-color: ${COLORS.ELEVATION_50};
  border-radius: var(--style-radius-m);
  color: ${COLORS.TEXT};
`

export const ErrorState = styled.div`
  padding: 2rem;
  text-align: center;
  background-color: var(--theme-error-50);
  color: var(--theme-error-950);
  border-radius: var(--style-radius-m);
`

export const EmptyState = styled.div<{ $fontSize?: string }>`
  padding: 2rem;
  text-align: center;
  background-color: ${COLORS.ELEVATION_50};
  border: 1px dashed ${COLORS.BORDER};
  border-radius: var(--style-radius-m);
  color: ${COLORS.ELEVATION_600};
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${(props) => props.$fontSize || '1rem'};
`

// Component Headers
export const ComponentHeader = styled.h4`
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  font-weight: 600;
  flex-shrink: 0;
  color: ${COLORS.TEXT};
`

export const ComponentHeaderCount = styled.span`
  font-size: 0.875rem;
  font-weight: normal;
  color: ${COLORS.ELEVATION_600};
  margin-left: 0.5rem;
`

// Grid Components
export const FramesGrid = styled.div<{ $columns: string; $gap: string }>`
  display: grid;
  grid-template-columns: ${(props) => props.$columns};
  gap: ${(props) => props.$gap};
  flex: 1;
  overflow-y: auto;
  padding: ${GRID_CONFIG.GAP};
  background-color: ${COLORS.ELEVATION_50};
  border-radius: var(--style-radius-m);
  border: 1px solid ${COLORS.BORDER};
  min-height: 0;
  justify-items: center;
`

export const FrameManagerList = styled.div`
  background-color: ${COLORS.ELEVATION_50};
  border: 1px solid ${COLORS.BORDER};
  border-radius: var(--style-radius-m);
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`

export const FrameManagerItem = styled.div<{ $isLast?: boolean }>`
  display: flex;
  align-items: center;
  padding: 0.1rem;
  border-bottom: ${(props) => (props.$isLast ? 'none' : `1px solid ${COLORS.BORDER}`)};
  gap: 0.5rem;
`

export const FrameInfo = styled.div`
  flex: 1;
  min-width: 0;
  line-height: 1em;
`

export const FrameInfoTitle = styled.div`
  font-size: 0.8rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: ${COLORS.TEXT};
`

export const FrameInfoSubtext = styled.div`
  font-size: 0.7rem;
  color: ${COLORS.ELEVATION_600};
`

export const TimestampInput = styled.input<{ $hasError?: boolean }>`
  width: 40px;
  height: 28px;
  padding: 0.4rem 0.2rem;
  border: ${(props) =>
    props.$hasError ? `1px solid ${COLORS.ERROR}` : `1px solid ${COLORS.BORDER}`};
  border-radius: var(--style-radius-s);
  font-size: 0.75rem;
  text-align: center;
  background-color: ${COLORS.BG};
  color: ${COLORS.TEXT};
`

export const TimestampError = styled.div`
  font-size: 0.6rem;
  color: ${COLORS.ERROR};
  max-width: 100px;
  text-align: right;
  line-height: 1.2;
`

// Category Filters
export const CategoryFilters = styled.div`
  margin-bottom: ${GRID_CONFIG.GAP};
  flex-shrink: 0;
`

export const CategoryFilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${GRID_CONFIG.GAP_SMALL};
  align-items: center;
`

export const CategoryButton = styled.button<{ $selected?: boolean; $disabled?: boolean }>`
  padding: 0.125rem 0.5rem;
  font-size: 0.8rem;
  border: 1px solid ${COLORS.BORDER};
  border-radius: 12px;
  margin: 0.1rem;
  cursor: ${(props) => (props.$disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(props) => (props.$disabled ? 0.6 : 1)};

  ${(props) =>
    props.$selected
      ? css`
          background-color: ${COLORS.SUCCESS};
          color: white;
        `
      : css`
          background-color: ${COLORS.BG};
          color: ${COLORS.TEXT};
        `}
`

export const ClearFiltersButton = styled.button<{ $disabled?: boolean }>`
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  background-color: transparent;
  color: ${COLORS.ERROR};
  border: none;
  cursor: ${(props) => (props.$disabled ? 'not-allowed' : 'pointer')};
  text-decoration: underline;
  margin-left: 4px;
`

// Frame Manager Components
export const FramesList = styled.div`
  background-color: ${COLORS.ELEVATION_50};
  border: 1px solid ${COLORS.BORDER};
  border-radius: var(--style-radius-m);
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`

export const FrameItemRow = styled.div<{ isLast?: boolean }>`
  display: flex;
  align-items: center;
  padding: 0.75rem;
  border-bottom: ${(props) => (props.isLast ? 'none' : `1px solid ${COLORS.BORDER}`)};
  gap: 0.5rem;
`

export const FrameThumbnail = styled.div<{ $size: number }>`
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  background-color: ${COLORS.ELEVATION_100};
  border-radius: var(--style-radius-m);
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  border: 1px solid ${COLORS.BORDER};
`

// Frame Preview Components
export const PreviewContainer = styled.div<{ $width: number; $height: number }>`
  width: ${(props) => props.$width}px;
  height: ${(props) => props.$height}px;
  background-color: #000;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  border: 1px solid #dee2e6;
`

export const TimelineContainer = styled.div`
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #666;
`

export const TimelineHeader = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
`

export const TimelineTrack = styled.div`
  width: 100%;
  height: 4px;
  background-color: #e9ecef;
  border-radius: 2px;
  position: relative;
`

export const TimelineMarker = styled.div<{ $left: number; $isActive?: boolean }>`
  position: absolute;
  left: ${(props) => props.$left}%;
  top: 0;
  width: 4px;
  height: 4px;
  background-color: ${(props) => (props.$isActive ? '#007bff' : '#6c757d')};
  border-radius: 2px;
  transform: translateX(-2px);
  z-index: ${(props) => (props.$isActive ? 2 : 1)};
`

export const TimelineIndicator = styled.div<{ $left: number }>`
  position: absolute;
  left: ${(props) => props.$left}%;
  top: -2px;
  width: 2px;
  height: 8px;
  background-color: #dc3545;
  transform: translateX(-1px);
  z-index: 3;
`

// Frame Item Components
export const FrameItemContainer = styled.div<{
  $size: number
  $disabled: boolean
  $clickable: boolean
  $selected: boolean
  $clicked: boolean
}>`
  position: relative;
  cursor: ${(props) =>
    props.$disabled ? 'not-allowed' : props.$clickable ? 'pointer' : 'default'};
  opacity: ${(props) => (props.$disabled ? 0.6 : 1)};
  width: ${(props) => props.$size}px;
  border: ${(props) =>
    props.$selected || props.$clicked ? `2px solid ${COLORS.SUCCESS}` : '1px solid #ddd'};
  border-radius: 4px;
  background-color: ${(props) => (props.$selected || props.$clicked ? '#f8fff9' : '#fff')};
  transition: all 0.2s ease-in-out;
  transform: ${(props) => (props.$clicked ? 'scale(1.08)' : 'scale(1)')};
  box-shadow: ${(props) =>
    props.$selected || props.$clicked ? '0 6px 12px rgba(40, 167, 69, 0.3)' : 'none'};
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
`

export const FrameTags = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  text-align: center;
`

export const ComponentContainer = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`

// Media overlay
export const MediaOverlay = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: #fff;
  padding: 1rem 0.75rem 0.5rem;
  font-size: 0.75rem;
`

export const OverlayTitle = styled.div`
  font-weight: 500;
`

export const OverlaySubtitle = styled.div`
  opacity: 0.8;
`
