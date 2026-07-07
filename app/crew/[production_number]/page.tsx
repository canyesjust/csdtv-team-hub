'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface SignupView {
  student_name: string | null
  signed_up_by_self: boolean
}

interface SlotView {
  id: string
  role_name: string
  capacity: number
  call_time: string | null
  end_time: string | null
  notes: string | null
  allowed_tiers: string[] | null
  signups: SignupView[]
}

interface PublicData {
  production: {
    id: string
    production_number: number
    title: string
    start_datetime: string | null
    filming_location: string | null
    school_department: string | null
  }
  crew: {
    display_title: string | null
    call_time: string | null
    event_start_time: string | null
    end_time: string | null
    meeting_location: string | null
    what_youll_do: string | null
    food: string | null
    what_to_wear: string | null
    transportation_note: string | null
    requirements: string[] | null
    hide_names_on_public: boolean | null
  }
  slots: SlotView[]
  is_past: boolean
  is_disabled: boolean
}

const colors = {
  bg: '#f8f9fc',
  cardBg: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  text: '#1a1f36',
  muted: '#6b7280',
  primary: '#1e6cb5',
  success: '#22c55e',
  danger: '#ef4444',
}

export default function PublicCrewPage() {
  const params = useParams()
  const productionNumber = params.production_number as string

  const [data, setData] = useState<PublicData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [signupSlotId, setSignupSlotId] = useState<string | null>(null)
  const [step, setStep] = useState<'gate' | 'student'>('gate')
  const [signedUpBySelf, setSignedUpBySelf] = useState<boolean | null>(null)
  const [studentNumber, setStudentNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/crew/${productionNumber}`)
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Could not load this event')
        setLoading(false)
        return
      }
      const result = await res.json()
      setData(result)
      setLoading(false)
    } catch {
      setError('Network error — please try again')
      setLoading(false)
    }
  }, [productionNumber])

  useEffect(() => { load() }, [load])

  const closeModal = () => {
    setSignupSlotId(null)
    setStep('gate')
    setSignedUpBySelf(null)
    setStudentNumber('')
    setSubmitMsg(null)
  }

  const submitSignup = async () => {
    if (!signupSlotId || signedUpBySelf === null || !studentNumber.trim()) return
    setSubmitting(true)
    setSubmitMsg(null)
    try {
      const res = await fetch(`/api/crew/${productionNumber}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: signupSlotId,
          student_number: studentNumber.trim(),
          signed_up_by_self: signedUpBySelf,
        }),
      })
      const result = await res.json()
      setSubmitting(false)
      if (!res.ok) {
        setSubmitMsg({ type: 'error', text: result.error || 'Could not sign up' })
        return
      }
      setSubmitMsg({ type: 'success', text: result.message || "You're signed up!" })
      setTimeout(() => {
        closeModal()
        load()
      }, 2500)
    } catch {
      setSubmitting(false)
      setSubmitMsg({ type: 'error', text: 'Network error — please try again' })
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <p style={{ color: colors.muted }}>Loading...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: '500px', textAlign: 'center', background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '40px 24px' }}>
          <p style={{ fontSize: '20px', fontWeight: 600, color: colors.text, margin: '0 0 8px' }}>This event isn&apos;t available</p>
          <p style={{ fontSize: '14px', color: colors.muted, margin: 0 }}>{error || 'The sign-up page may have closed or the event has ended.'}</p>
        </div>
      </div>
    )
  }

  if (data.is_past) {
    return (
      <div style={{ minHeight: '100vh', background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: '500px', textAlign: 'center', background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '40px 24px' }}>
          <p style={{ fontSize: '20px', fontWeight: 600, color: colors.text, margin: '0 0 8px' }}>This event has already happened</p>
          <p style={{ fontSize: '14px', color: colors.muted, margin: 0 }}>Sign-ups are closed.</p>
        </div>
      </div>
    )
  }

  const startDate = data.production.start_datetime ? new Date(data.production.start_datetime) : null
  const dateStr = startDate ? startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'
  const fallbackTime = startDate ? startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
  const eventTime = data.crew.event_start_time || fallbackTime
  const totalCapacity = data.slots.reduce((s, slot) => s + slot.capacity, 0)
  const totalFilled = data.slots.reduce((s, slot) => s + slot.signups.length, 0)

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, fontFamily: 'system-ui, -apple-system, sans-serif', color: colors.text, paddingBottom: '40px' }}>
      <div style={{ background: colors.primary, color: '#fff', padding: '24px 20px' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' as const, margin: '0 0 6px', opacity: 0.85 }}>CSDtv Crew Sign-Up</p>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px' }}>{data.crew.display_title || data.production.title}</h1>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>#{data.production.production_number}</p>
        </div>
      </div>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '20px' }}>
        <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '20px', marginBottom: '14px' }}>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 2px' }}>Date</p>
              <p style={{ fontSize: '15px', fontWeight: 500, color: colors.text, margin: 0 }}>{dateStr}</p>
            </div>
            {(data.crew.call_time || eventTime || data.crew.end_time) && (
              <div>
                <p style={{ fontSize: '11px', fontWeight: 600, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 2px' }}>Time</p>
                <p style={{ fontSize: '14px', color: colors.text, margin: 0 }}>
                  {data.crew.call_time && <>Call <strong>{data.crew.call_time}</strong></>}
                  {data.crew.call_time && eventTime && ' · '}
                  {eventTime && <>Event starts <strong>{eventTime}</strong></>}
                  {(data.crew.call_time || eventTime) && data.crew.end_time && ' · '}
                  {data.crew.end_time && <>Wrap <strong>{data.crew.end_time}</strong></>}
                </p>
              </div>
            )}
            {data.crew.meeting_location && (
              <div>
                <p style={{ fontSize: '11px', fontWeight: 600, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 2px' }}>Where to meet</p>
                <p style={{ fontSize: '14px', color: colors.text, margin: 0, lineHeight: 1.5 }}>{data.crew.meeting_location}</p>
              </div>
            )}
            {data.crew.what_youll_do && (
              <div>
                <p style={{ fontSize: '11px', fontWeight: 600, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 2px' }}>What you&apos;ll do</p>
                <p style={{ fontSize: '14px', color: colors.text, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const }}>{data.crew.what_youll_do}</p>
              </div>
            )}
            {data.crew.what_to_wear && (
              <div>
                <p style={{ fontSize: '11px', fontWeight: 600, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 2px' }}>What to wear</p>
                <p style={{ fontSize: '14px', color: colors.text, margin: 0, lineHeight: 1.5 }}>{data.crew.what_to_wear}</p>
              </div>
            )}
            {data.crew.food && (
              <div>
                <p style={{ fontSize: '11px', fontWeight: 600, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 2px' }}>Food</p>
                <p style={{ fontSize: '14px', color: colors.text, margin: 0, lineHeight: 1.5 }}>🍕 {data.crew.food}</p>
              </div>
            )}
            {data.crew.transportation_note && (
              <div>
                <p style={{ fontSize: '11px', fontWeight: 600, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 2px' }}>Getting there</p>
                <p style={{ fontSize: '14px', color: colors.text, margin: 0, lineHeight: 1.5 }}>🚗 {data.crew.transportation_note}</p>
              </div>
            )}
            {data.crew.requirements && data.crew.requirements.length > 0 && (
              <div>
                <p style={{ fontSize: '11px', fontWeight: 600, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px' }}>Bring with you</p>
                <ul style={{ margin: 0, paddingLeft: '18px', color: colors.text, fontSize: '14px', lineHeight: 1.6 }}>
                  {data.crew.requirements.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, margin: '20px 0 10px' }}>
          Crew positions <span style={{ fontSize: '14px', fontWeight: 400, color: colors.muted }}>· {totalFilled} of {totalCapacity} filled</span>
        </h2>

        {data.slots.length === 0 ? (
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '24px', textAlign: 'center' as const }}>
            <p style={{ color: colors.muted, fontSize: '14px', margin: 0 }}>No crew positions are open yet for this event. Check back soon.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
            {data.slots.map(slot => {
              const open = slot.capacity - slot.signups.length
              const isFull = open === 0
              return (
                <div key={slot.id} style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: slot.signups.length > 0 ? '8px' : 0, flexWrap: 'wrap' as const }}>
                    <div style={{ flex: 1, minWidth: '180px' }}>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: colors.text, margin: 0 }}>
                        {slot.role_name} <span style={{ fontSize: '13px', color: colors.muted, fontWeight: 400 }}>× {slot.capacity}</span>
                      </p>
                      {slot.allowed_tiers && slot.allowed_tiers.length > 0 && (
                        <span style={{ display: 'inline-block', marginTop: '4px', fontSize: '11px', fontWeight: 600, color: '#92400e', background: 'rgba(245,158,11,0.15)', padding: '2px 8px', borderRadius: '6px' }}>
                          🔒 {slot.allowed_tiers.join(', ')} only
                        </span>
                      )}
                      {(slot.call_time || slot.end_time || slot.notes) && (
                        <p style={{ fontSize: '12px', color: colors.muted, margin: '2px 0 0' }}>
                          {slot.call_time && `Call ${slot.call_time}`}
                          {slot.call_time && slot.end_time && ' · '}
                          {slot.end_time && `End ${slot.end_time}`}
                          {(slot.call_time || slot.end_time) && slot.notes && ' · '}
                          {slot.notes}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => { if (!isFull) { setSignupSlotId(slot.id); setStep('gate') } }}
                      disabled={isFull}
                      style={{
                        fontSize: '14px',
                        padding: '10px 18px',
                        borderRadius: '10px',
                        background: isFull ? '#e2e8f0' : colors.primary,
                        color: isFull ? colors.muted : '#fff',
                        border: 'none',
                        cursor: isFull ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        fontWeight: 600,
                        minHeight: '44px',
                      }}
                    >
                      {isFull ? '✓ Full' : `Sign up (${open} open)`}
                    </button>
                  </div>
                  {slot.signups.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px', paddingTop: '8px', borderTop: `1px solid ${colors.border}` }}>
                      {slot.signups.map((su, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                          <span style={{ fontSize: '13px' }}>{su.signed_up_by_self ? '🎓' : '👪'}</span>
                          <span style={{ color: colors.text }}>{su.student_name || 'Signed up'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {data.crew.hide_names_on_public && (
          <p style={{ fontSize: '12px', color: colors.muted, textAlign: 'center' as const, margin: '16px 0 0' }}>
            Other students&apos; names are hidden for privacy.
          </p>
        )}
        <p style={{ fontSize: '12px', color: colors.muted, textAlign: 'center' as const, margin: '8px 0 0' }}>
          🎓 = student signed up · 👪 = parent signed up on their behalf
        </p>
      </div>

      {signupSlotId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget && !submitting) closeModal() }}
        >
          <div style={{ background: colors.cardBg, borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px' }}>
            {submitMsg ? (
              <div style={{ textAlign: 'center' as const }}>
                <p style={{ fontSize: '40px', margin: '0 0 8px' }}>{submitMsg.type === 'success' ? '🎉' : '😕'}</p>
                <p style={{ fontSize: '16px', fontWeight: 600, color: submitMsg.type === 'success' ? colors.success : colors.danger, margin: '0 0 8px' }}>
                  {submitMsg.type === 'success' ? "You're signed up!" : 'Sign-up failed'}
                </p>
                <p style={{ fontSize: '14px', color: colors.muted, margin: 0, lineHeight: 1.5 }}>{submitMsg.text}</p>
              </div>
            ) : step === 'gate' ? (
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, margin: '0 0 4px' }}>Who&apos;s signing up?</h3>
                <p style={{ fontSize: '13px', color: colors.muted, margin: '0 0 16px' }}>This helps us tell parents and students apart.</p>
                <button onClick={() => { setSignedUpBySelf(true); setStep('student') }} style={{ width: '100%', fontSize: '15px', padding: '14px', borderRadius: '10px', background: colors.primary, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, marginBottom: '8px' }}>
                  🎓 I&apos;m the student
                </button>
                <button onClick={() => { setSignedUpBySelf(false); setStep('student') }} style={{ width: '100%', fontSize: '15px', padding: '14px', borderRadius: '10px', background: '#fff', color: colors.text, border: `1px solid ${colors.border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                  👪 I&apos;m a parent or guardian
                </button>
                <button onClick={closeModal} style={{ width: '100%', fontSize: '13px', padding: '10px', borderRadius: '8px', background: 'transparent', color: colors.muted, border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: '4px' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, margin: '0 0 4px' }}>Student number</h3>
                <p style={{ fontSize: '13px', color: colors.muted, margin: '0 0 16px' }}>{signedUpBySelf ? 'Enter YOUR student number.' : "Enter your student's number."}</p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={studentNumber}
                  onChange={e => setStudentNumber(e.target.value)}
                  placeholder="e.g. 12345678"
                  autoFocus
                  style={{ width: '100%', fontSize: '17px', padding: '14px', borderRadius: '10px', border: `1px solid ${colors.border}`, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, marginBottom: '14px' }}
                />
                <button onClick={submitSignup} disabled={!studentNumber.trim() || submitting} style={{ width: '100%', fontSize: '15px', padding: '14px', borderRadius: '10px', background: studentNumber.trim() && !submitting ? colors.primary : '#e2e8f0', color: studentNumber.trim() && !submitting ? '#fff' : colors.muted, border: 'none', cursor: studentNumber.trim() && !submitting ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 600 }}>
                  {submitting ? 'Signing up...' : 'Sign me up'}
                </button>
                <button onClick={() => setStep('gate')} disabled={submitting} style={{ width: '100%', fontSize: '13px', padding: '10px', borderRadius: '8px', background: 'transparent', color: colors.muted, border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: '4px' }}>
                  ← Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
