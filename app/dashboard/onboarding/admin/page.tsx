'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../../components/Loader'
import {
  ONBOARDING_TRACK_INTERN,
  ONBOARDING_TRACK_STUDENT_INTERN,
  type OnboardingTrackId,
} from '@/lib/onboarding/constants'
import { ensureOnboardingSeed } from '@/lib/onboarding/seed-database'
import { syncTemplateToOpenAssignments } from '@/lib/onboarding/sync-template'
import type {
  OnboardingCategory,
  OnboardingPhase,
  OnboardingTemplateItem,
} from '@/lib/onboarding/types'

type ArticleOption = { id: string; title: string }

function OnboardingAdminContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const trackId = (searchParams.get('track') === ONBOARDING_TRACK_STUDENT_INTERN
    ? ONBOARDING_TRACK_STUDENT_INTERN
    : ONBOARDING_TRACK_INTERN) as OnboardingTrackId

  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [phases, setPhases] = useState<OnboardingPhase[]>([])
  const [categories, setCategories] = useState<OnboardingCategory[]>([])
  const [items, setItems] = useState<OnboardingTemplateItem[]>([])
  const [articles, setArticles] = useState<ArticleOption[]>([])
  const [newPhase, setNewPhase] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newItem, setNewItem] = useState({
    title: '',
    description: '',
    phase_id: '',
    category_id: '',
    library_article_id: '',
    required: true,
  })

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const inputStyle: React.CSSProperties = {
    background: inputBg,
    border: `0.5px solid ${border}`,
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '14px',
    color: text,
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  }

  const runSync = useCallback(async () => {
    setSyncing(true)
    await syncTemplateToOpenAssignments(supabase, trackId)
    setSyncing(false)
  }, [supabase, trackId])

  const load = useCallback(async () => {
    setLoading(true)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const { data: me } = await supabase
      .from('team')
      .select('role')
      .eq('supabase_user_id', session.user.id)
      .single()
    if (me?.role !== 'Manager') {
      router.replace('/dashboard/onboarding')
      return
    }

    await ensureOnboardingSeed(supabase)

    const [phaseRes, catRes, itemRes, artRes] = await Promise.all([
      supabase.from('onboarding_phases').select('*').eq('track_id', trackId).order('sort_order'),
      supabase.from('onboarding_categories').select('*').eq('track_id', trackId).order('sort_order'),
      supabase.from('onboarding_template_items').select('*').eq('track_id', trackId).order('sort_order'),
      supabase.from('knowledge_base').select('id, title').order('title'),
    ])

    setPhases((phaseRes.data as OnboardingPhase[]) || [])
    setCategories((catRes.data as OnboardingCategory[]) || [])
    setItems((itemRes.data as OnboardingTemplateItem[]) || [])
    setArticles((artRes.data as ArticleOption[]) || [])
    setLoading(false)
  }, [supabase, trackId, router])

  useEffect(() => {
    void load()
  }, [load])

  const setTrack = (id: OnboardingTrackId) => {
    router.replace(`/dashboard/onboarding/admin?track=${id}`)
  }

  const addPhase = async () => {
    if (!newPhase.trim()) return
    const sort_order = phases.length
    const { data, error } = await supabase
      .from('onboarding_phases')
      .insert({ track_id: trackId, label: newPhase.trim(), sort_order, active: true })
      .select('*')
      .single()
    if (!error && data) {
      setPhases((p) => [...p, data as OnboardingPhase])
      setNewPhase('')
    }
  }

  const updatePhaseLabel = async (phase: OnboardingPhase, label: string) => {
    await supabase.from('onboarding_phases').update({ label }).eq('id', phase.id)
    setPhases((p) => p.map((x) => (x.id === phase.id ? { ...x, label } : x)))
    await runSync()
  }

  const addCategory = async () => {
    if (!newCategory.trim()) return
    const sort_order = categories.length
    const { data, error } = await supabase
      .from('onboarding_categories')
      .insert({ track_id: trackId, label: newCategory.trim(), sort_order, active: true })
      .select('*')
      .single()
    if (!error && data) {
      setCategories((c) => [...c, data as OnboardingCategory])
      setNewCategory('')
    }
  }

  const updateCategoryLabel = async (cat: OnboardingCategory, label: string) => {
    await supabase.from('onboarding_categories').update({ label }).eq('id', cat.id)
    setCategories((c) => c.map((x) => (x.id === cat.id ? { ...x, label } : x)))
    await runSync()
  }

  const addItem = async () => {
    if (!newItem.title.trim() || !newItem.phase_id || !newItem.category_id) return
    const sort_order = items.length
    const { data, error } = await supabase
      .from('onboarding_template_items')
      .insert({
        track_id: trackId,
        phase_id: newItem.phase_id,
        category_id: newItem.category_id,
        title: newItem.title.trim(),
        description: newItem.description,
        library_article_id: newItem.library_article_id || null,
        sort_order,
        required: newItem.required,
        active: true,
      })
      .select('*')
      .single()
    if (!error && data) {
      setItems((i) => [...i, data as OnboardingTemplateItem])
      setNewItem({
        title: '',
        description: '',
        phase_id: newItem.phase_id,
        category_id: newItem.category_id,
        library_article_id: '',
        required: true,
      })
      await runSync()
    }
  }

  const updateItem = async (item: OnboardingTemplateItem, patch: Partial<OnboardingTemplateItem>) => {
    const { data, error } = await supabase
      .from('onboarding_template_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .select('*')
      .single()
    if (!error && data) {
      setItems((list) => list.map((x) => (x.id === item.id ? (data as OnboardingTemplateItem) : x)))
      await runSync()
    }
  }

  const retireItem = async (item: OnboardingTemplateItem) => {
    if (!confirm(`Remove "${item.title}" from the track for everyone still onboarding?`)) return
    await updateItem(item, { active: false })
    setItems((list) => list.filter((x) => x.id !== item.id))
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <Loader />
      </div>
    )
  }

  const activeItems = items.filter((i) => i.active)

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <Link href="/dashboard/onboarding" style={{ fontSize: '14px', color: muted, textDecoration: 'none' }}>
        ← Onboarding
      </Link>
      <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: '12px 0 4px' }}>
        Edit onboarding templates
      </h1>
      <p style={{ fontSize: '14px', color: muted, margin: '0 0 16px' }}>
        Changes sync to everyone still onboarding (not those already signed off).
        {syncing ? ' Syncing…' : ''}
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button
          type="button"
          onClick={() => setTrack(ONBOARDING_TRACK_INTERN)}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            background: trackId === ONBOARDING_TRACK_INTERN ? '#1e6cb5' : cardBg,
            color: trackId === ONBOARDING_TRACK_INTERN ? '#fff' : muted,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          Staff intern
        </button>
        <button
          type="button"
          onClick={() => setTrack(ONBOARDING_TRACK_STUDENT_INTERN)}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            background: trackId === ONBOARDING_TRACK_STUDENT_INTERN ? '#1e6cb5' : cardBg,
            color: trackId === ONBOARDING_TRACK_STUDENT_INTERN ? '#fff' : muted,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          Student intern
        </button>
      </div>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 10px' }}>Phases</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
          {phases.map((p) => (
            <input
              key={p.id}
              defaultValue={p.label}
              onBlur={(e) => {
                if (e.target.value !== p.label) void updatePhaseLabel(p, e.target.value)
              }}
              style={inputStyle}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={newPhase}
            onChange={(e) => setNewPhase(e.target.value)}
            placeholder="New phase name"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => void addPhase()}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#1e6cb5',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Add phase
          </button>
        </div>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 10px' }}>Categories</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
          {categories.map((c) => (
            <input
              key={c.id}
              defaultValue={c.label}
              onBlur={(e) => {
                if (e.target.value !== c.label) void updateCategoryLabel(c, e.target.value)
              }}
              style={inputStyle}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category name"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => void addCategory()}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#1e6cb5',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Add category
          </button>
        </div>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 12px' }}>
          Checklist items ({activeItems.length})
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {activeItems.map((item) => {
            const phase = phases.find((p) => p.id === item.phase_id)
            const cat = categories.find((c) => c.id === item.category_id)
            return (
              <div
                key={item.id}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  border: `0.5px solid ${border}`,
                  background: cardBg,
                }}
              >
                <input
                  defaultValue={item.title}
                  onBlur={(e) => {
                    if (e.target.value !== item.title) void updateItem(item, { title: e.target.value })
                  }}
                  style={{ ...inputStyle, fontWeight: 600, marginBottom: '8px' }}
                />
                <textarea
                  defaultValue={item.description}
                  onBlur={(e) => {
                    if (e.target.value !== item.description)
                      void updateItem(item, { description: e.target.value })
                  }}
                  rows={2}
                  style={{ ...inputStyle, marginBottom: '8px', resize: 'vertical' }}
                />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <select
                    value={item.phase_id}
                    onChange={(e) => void updateItem(item, { phase_id: e.target.value })}
                    style={inputStyle}
                  >
                    {phases.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={item.category_id}
                    onChange={(e) => void updateItem(item, { category_id: e.target.value })}
                    style={inputStyle}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={item.library_article_id || ''}
                    onChange={(e) =>
                      void updateItem(item, { library_article_id: e.target.value || null })
                    }
                    style={inputStyle}
                  >
                    <option value="">No Library link</option>
                    {articles.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                </div>
                <p style={{ fontSize: '12px', color: muted, margin: '0 0 8px' }}>
                  {phase?.label} · {cat?.label}
                  {item.required ? ' · required' : ' · optional'}
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => void updateItem(item, { required: !item.required })}
                    style={{
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: `0.5px solid ${border}`,
                      background: 'transparent',
                      color: muted,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Toggle required
                  </button>
                  <button
                    type="button"
                    onClick={() => void retireItem(item)}
                    style={{
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '0.5px solid rgba(239,68,68,0.3)',
                      background: 'rgba(239,68,68,0.06)',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Remove from track
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section
        style={{
          padding: '16px',
          borderRadius: '12px',
          border: `0.5px solid ${border}`,
          background: dark ? 'rgba(30,108,181,0.06)' : 'rgba(30,108,181,0.04)',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 12px' }}>Add item</h2>
        <input
          value={newItem.title}
          onChange={(e) => setNewItem((n) => ({ ...n, title: e.target.value }))}
          placeholder="Title"
          style={{ ...inputStyle, marginBottom: '8px' }}
        />
        <textarea
          value={newItem.description}
          onChange={(e) => setNewItem((n) => ({ ...n, description: e.target.value }))}
          placeholder="Description"
          rows={2}
          style={{ ...inputStyle, marginBottom: '8px', resize: 'vertical' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <select
            value={newItem.phase_id}
            onChange={(e) => setNewItem((n) => ({ ...n, phase_id: e.target.value }))}
            style={inputStyle}
          >
            <option value="">Phase</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={newItem.category_id}
            onChange={(e) => setNewItem((n) => ({ ...n, category_id: e.target.value }))}
            style={inputStyle}
          >
            <option value="">Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <select
          value={newItem.library_article_id}
          onChange={(e) => setNewItem((n) => ({ ...n, library_article_id: e.target.value }))}
          style={{ ...inputStyle, marginBottom: '10px' }}
        >
          <option value="">Link to Library article (optional)</option>
          {articles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void addItem()}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            background: '#1e6cb5',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          Add to track
        </button>
      </section>
    </div>
  )
}

export default function OnboardingAdminPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <Loader />
        </div>
      }
    >
      <OnboardingAdminContent />
    </Suspense>
  )
}
