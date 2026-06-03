'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
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
import OnboardingTemplateEditor from './OnboardingTemplateEditor'

type ArticleOption = { id: string; title: string }

function OnboardingAdminContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const trackId = (searchParams.get('track') === ONBOARDING_TRACK_STUDENT_INTERN
    ? ONBOARDING_TRACK_STUDENT_INTERN
    : ONBOARDING_TRACK_INTERN) as OnboardingTrackId

  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [reapplying, setReapplying] = useState(false)
  const [phases, setPhases] = useState<OnboardingPhase[]>([])
  const [categories, setCategories] = useState<OnboardingCategory[]>([])
  const [items, setItems] = useState<OnboardingTemplateItem[]>([])
  const [articles, setArticles] = useState<ArticleOption[]>([])

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

  const addPhase = async (label: string) => {
    if (!label.trim()) return
    const sort_order = phases.length
    const { data, error } = await supabase
      .from('onboarding_phases')
      .insert({ track_id: trackId, label: label.trim(), sort_order, active: true })
      .select('*')
      .single()
    if (!error && data) setPhases((p) => [...p, data as OnboardingPhase])
  }

  const updatePhaseLabel = async (phase: OnboardingPhase, label: string) => {
    await supabase.from('onboarding_phases').update({ label }).eq('id', phase.id)
    setPhases((p) => p.map((x) => (x.id === phase.id ? { ...x, label } : x)))
    await runSync()
  }

  const addCategory = async (label: string) => {
    if (!label.trim()) return
    const sort_order = categories.length
    const { data, error } = await supabase
      .from('onboarding_categories')
      .insert({ track_id: trackId, label: label.trim(), sort_order, active: true })
      .select('*')
      .single()
    if (!error && data) setCategories((c) => [...c, data as OnboardingCategory])
  }

  const updateCategoryLabel = async (cat: OnboardingCategory, label: string) => {
    await supabase.from('onboarding_categories').update({ label }).eq('id', cat.id)
    setCategories((c) => c.map((x) => (x.id === cat.id ? { ...x, label } : x)))
    await runSync()
  }

  const addItem = async (draft: {
    title: string
    description: string
    phase_id: string
    category_id: string
    library_article_id: string
    required: boolean
  }) => {
    if (!draft.title.trim() || !draft.phase_id || !draft.category_id) return
    const sort_order = items.length
    const { data, error } = await supabase
      .from('onboarding_template_items')
      .insert({
        track_id: trackId,
        phase_id: draft.phase_id,
        category_id: draft.category_id,
        title: draft.title.trim(),
        description: draft.description,
        library_article_id: draft.library_article_id || null,
        sort_order,
        required: draft.required,
        active: true,
      })
      .select('*')
      .single()
    if (!error && data) {
      setItems((i) => [...i, data as OnboardingTemplateItem])
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

  const reapplyStudentTemplate = async () => {
    if (trackId !== ONBOARDING_TRACK_STUDENT_INTERN) return
    if (
      !confirm(
        'Replace the student intern checklist with the latest default template? Existing custom edits will be retired. Active onboardings will get the new items.',
      )
    ) {
      return
    }
    setReapplying(true)
    try {
      const res = await fetch('/api/admin/onboarding/reapply-student-template', { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) {
        alert(body.error || 'Failed to reload template')
        return
      }
      await load()
    } finally {
      setReapplying(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <Loader />
      </div>
    )
  }

  return (
    <OnboardingTemplateEditor
      trackId={trackId}
      syncing={syncing}
      reapplying={reapplying}
      phases={phases}
      categories={categories}
      items={items}
      articles={articles}
      onSetTrack={setTrack}
      onReapplyStudentTemplate={reapplyStudentTemplate}
      onAddPhase={addPhase}
      onUpdatePhaseLabel={updatePhaseLabel}
      onAddCategory={addCategory}
      onUpdateCategoryLabel={updateCategoryLabel}
      onAddItem={addItem}
      onUpdateItem={updateItem}
      onRetireItem={retireItem}
    />
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
