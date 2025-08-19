'use client'

import { useState, useEffect } from 'react'

export default function LoadingOverlay() {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  if (!isVisible) return null

  return (
    <div className={`loading-overlay ${!isVisible ? 'hidden' : ''}`}>
      <div className="loading-spinner"></div>
    </div>
  )
}