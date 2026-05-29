'use client'
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function BlockBackInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [pathname, searchParams])

  return null
}

export default function BlockBack() {
  return (
    <Suspense fallback={null}>
      <BlockBackInner />
    </Suspense>
  )
}
