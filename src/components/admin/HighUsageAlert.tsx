'use client'

import React from 'react'
import { useFormFields } from '@payloadcms/ui'

interface HighUsageAlertProps {
  path: string
  clientProps?: {
    threshold?: number
  }
}

export const HighUsageAlert: React.FC<HighUsageAlertProps> = ({ 
  path: _path, 
  clientProps 
}) => {
  const { fields } = useFormFields(([fields]) => fields)
  const threshold = clientProps?.threshold || 1000
  
  // Get the daily requests value from nested usageStats
  const fieldsObj = fields as any
  const usageStatsField = fieldsObj?.usageStats || fieldsObj?.['usageStats']
  const dailyRequests = (usageStatsField?.value as any)?.dailyRequests as number || 0
  
  const isHighUsage = dailyRequests > threshold
  
  if (!isHighUsage) {
    return (
      <div style={{ 
        padding: '8px 12px',
        backgroundColor: '#f0f0f0',
        borderRadius: '4px',
        fontSize: '14px',
        color: '#666'
      }}>
        Normal usage: {dailyRequests.toLocaleString()} requests today
      </div>
    )
  }
  
  return (
    <div style={{ 
      padding: '12px 16px',
      backgroundColor: '#fff3cd',
      border: '1px solid #ffeaa7',
      borderRadius: '4px',
      marginBottom: '16px'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ 
          fontSize: '20px',
          color: '#f39c12'
        }}>⚠️</span>
        <div>
          <strong style={{ color: '#856404' }}>High Usage Alert</strong>
          <p style={{ 
            margin: '4px 0 0 0',
            fontSize: '14px',
            color: '#856404'
          }}>
            This client has made {dailyRequests.toLocaleString()} requests today 
            (threshold: {threshold.toLocaleString()})
          </p>
        </div>
      </div>
    </div>
  )
}

export default HighUsageAlert