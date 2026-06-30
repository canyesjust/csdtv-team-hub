'use client'

import { useState, useRef, useCallback } from 'react'
import { useTheme } from '@/lib/theme'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function EquipmentScanPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const router = useRouter()
  const supabase = createClient()

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const [tagInput, setTagInput] = useState('')
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  async function handleLookup() {
    if (!tagInput.trim()) return
    setSearching(true)
    setError('')
    const padded = tagInput.trim().padStart(4, '0')
    const { data } = await supabase.from('equipment').select('asset_tag').eq('asset_tag', padded).single()
    if (data) {
      stopCamera()
      router.push(`/dashboard/equipment/${data.asset_tag}`)
    } else {
      setError(`No item found with tag "${padded}"`)
    }
    setSearching(false)
  }

  const startCamera = useCallback(async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setCameraActive(true)
    } catch {
      setCameraError('Camera access denied. Check your browser permissions.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }, [])

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px' }}>
      <button onClick={() => { stopCamera(); router.push('/dashboard/equipment') }}
        style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit', marginBottom: '16px', padding: 0 }}>
        ← Equipment
      </button>

      <div style={{ maxWidth: '440px', margin: '40px auto', textAlign: 'center' as const }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: text, margin: '0 0 8px' }}>Equipment Lookup</h1>
        <p style={{ fontSize: '14px', color: muted, marginBottom: '20px' }}>
          Use the camera to read the tag, then type the number below
        </p>

        {cameraActive ? (
          <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${border}`, position: 'relative' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', borderRadius: '12px' }} />
            <button onClick={stopCamera} style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', fontSize: '14px', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Close camera
            </button>
          </div>
        ) : (
          <button onClick={startCamera} style={{ width: '100%', padding: '16px', borderRadius: '12px', background: cardBg, border: `1px solid ${border}`, cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontFamily: 'inherit', fontSize: '15px', color: text, fontWeight: 500, minHeight: '60px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Open camera to read tag
          </button>
        )}
        {cameraError && <p style={{ fontSize: '13px', color: '#ef4444', marginBottom: '12px' }}>{cameraError}</p>}

        <div style={{ background: cardBg, borderRadius: '16px', padding: '24px', border: `1px solid ${border}` }}>
          <input
            value={tagInput}
            onChange={e => { setTagInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
            placeholder="0000"
            style={{ background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', fontSize: '20px', color: text, fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box' as const, minHeight: '56px', textAlign: 'center' as const, letterSpacing: '4px', fontWeight: 700 }}
            autoFocus
            inputMode="numeric"
          />

          {error && <p style={{ fontSize: '13px', color: '#ef4444', marginTop: '10px' }}>{error}</p>}

          <button
            onClick={handleLookup}
            disabled={!tagInput.trim() || searching}
            style={{ background: tagInput.trim() ? 'var(--brand-primary)' : (dark ? '#333' : '#e2e8f0'), border: 'none', borderRadius: '12px', color: tagInput.trim() ? '#fff' : muted, padding: '14px', fontSize: '15px', cursor: tagInput.trim() ? 'pointer' : 'default', fontWeight: 600, fontFamily: 'inherit', width: '100%', marginTop: '16px', minHeight: '50px' }}
          >
            {searching ? 'Searching...' : 'Look Up'}
          </button>

          <p style={{ fontSize: '12px', color: muted, marginTop: '12px' }}>
            Type the 4-digit tag number from the equipment label
          </p>
        </div>
      </div>
    </div>
  )
}