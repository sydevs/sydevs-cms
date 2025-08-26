import React from 'react'
import './styles.css'

export const metadata = {
  description: 'A CMS for all We Meditate related services.',
  title: 'Sahaj Cloud CMS',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
