'use client'

import React from 'react'

/**
 * Custom Logo component for Payload admin panel
 * Displays the We Meditate coral square logo on login/signup pages
 */
export const Logo: React.FC = () => {
  return (
    <img
      src="https://raw.githubusercontent.com/sydevs/WeMeditate/refs/heads/master/app/frontend/images/metadata/favicon-square.png"
      alt="We Meditate"
      style={{
        maxWidth: '100%',
        height: 'auto',
        display: 'block',
      }}
    />
  )
}
