'use client'

import React from 'react'
import Image from 'next/image'

/**
 * Custom Logo component for Payload admin panel
 * Displays the We Meditate coral square logo on login/signup pages
 */
export const Logo = () => {
  return (
    <Image
      src="https://raw.githubusercontent.com/sydevs/WeMeditate/refs/heads/master/app/frontend/images/metadata/favicon-square.png"
      alt="We Meditate"
      width={200}
      height={200}
      style={{
        maxWidth: '100%',
        height: 'auto',
        display: 'block',
      }}
      priority
    />
  )
}
