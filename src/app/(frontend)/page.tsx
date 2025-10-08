import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import './styles.css'

export default async function HomePage() {
  return (
    <div className="splash-container">
      <div className="animated-bg">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
      </div>

      <div className="splash-content">
        <div className="logo-container">
          <Image
            src="https://raw.githubusercontent.com/sydevs/WeMeditate/refs/heads/master/app/frontend/images/metadata/favicon-square.png"
            alt="We Meditate"
            width={150}
            height={150}
            className="logo-image"
            priority
          />
        </div>

        <h1 className="splash-title">We Meditate Admin</h1>

        <Link href="/admin" className="admin-button">
          <span className="button-text">Enter Admin Panel</span>
          <svg
            className="button-arrow"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 12h14m0 0l-6-6m6 6l-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>

      <div className="splash-footer">
        <p className="copyright">We Meditate • Powered by Payload CMS</p>
      </div>
    </div>
  )
}
