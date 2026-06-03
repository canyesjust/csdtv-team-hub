'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ONBOARDING_TRACK_INTERN,
  ONBOARDING_TRACK_STUDENT_INTERN,
  type OnboardingTrackId,
} from '@/lib/onboarding/constants'
import { groupTemplateByPhaseCategory } from '@/lib/onboarding/checklist-utils'
import type {
  OnboardingCategory,
  OnboardingPhase,
  OnboardingTemplateItem,
} from '@/lib/onboarding/types'
import { planLibraryLinksForTemplateItems } from '@/lib/library/link-library-articles'
import { toast } from '@/lib/toast'

type ArticleOption = { id: string; title: string }

type ItemDraft = {
  title: string
  description: string
  phase_id: string
  category_id: string
  library_article_id: string
  required: boolean
}

type Props = {
  trackId: OnboardingTrackId
  syncing: boolean
  reapplying?: boolean
  phases: OnboardingPhase[]
  categories: OnboardingCategory[]
  items: OnboardingTemplateItem[]
  articles: ArticleOption[]
  onSetTrack: (id: OnboardingTrackId) => void
  onReapplyStudentTemplate?: () => Promise<void>
  onAddPhase: (label: string) => Promise<void>
  onUpdatePhaseLabel: (phase: OnboardingPhase, label: string) => Promise<void>
  onAddCategory: (label: string) => Promise<void>
  onUpdateCategoryLabel: (cat: OnboardingCategory, label: string) => Promise<void>
  onAddItem: (draft: ItemDraft) => Promise<void>
  onUpdateItem: (item: OnboardingTemplateItem, patch: Partial<OnboardingTemplateItem>) => Promise<void>
  onRetireItem: (item: OnboardingTemplateItem) => Promise<void>
}

const emptyDraft = (phaseId = '', categoryId = ''): ItemDraft => ({
  title: '',
  description: '',
  phase_id: phaseId,
  category_id: categoryId,
  library_article_id: '',
  required: true,
})

export default function OnboardingTemplateEditor({
  trackId,
  syncing,
  reapplying = false,
  phases,
  categories,
  items,
  articles,
  onSetTrack,
  onReapplyStudentTemplate,
  onAddPhase,
  onUpdatePhaseLabel,
  onAddCategory,
  onUpdateCategoryLabel,
  onAddItem,
  onUpdateItem,
  onRetireItem,
}: Props) {
  const [tab, setTab] = useState<'checklist' | 'structure'>('checklist')
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<OnboardingTemplateItem | null>(null)
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft())
  const [newPhase, setNewPhase] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [linkingLibrary, setLinkingLibrary] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'
  const brand = 'var(--brand-primary)'

  const activeItems = items.filter((i) => i.active)
  const grouped = useMemo(
    () => groupTemplateByPhaseCategory(items, phases, categories),
    [items, phases, categories],
  )

  const articleById = useMemo(() => Object.fromEntries(articles.map((a) => [a.id, a.title])), [articles])

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

  const tabBtn = (id: 'checklist' | 'structure', label: string) => {
    const active = tab === id
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        style={{
          padding: '8px 14px',
          borderRadius: '8px',
          border: 'none',
          background: active ? brand : 'transparent',
          color: active ? '#fff' : muted,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: 500,
          fontSize: '14px',
        }}
      >
        {label}
      </button>
    )
  }

  const togglePhase = (phaseId: string) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
      return next
    })
  }

  const openAdd = (phaseId?: string, categoryId?: string) => {
    setDraft(emptyDraft(phaseId || phases[0]?.id || '', categoryId || categories[0]?.id || ''))
    setModal('add')
  }

  const openEdit = (item: OnboardingTemplateItem) => {
    setEditingItem(item)
    setDraft({
      title: item.title,
      description: item.description,
      phase_id: item.phase_id,
      category_id: item.category_id,
      library_article_id: item.library_article_id || '',
      required: item.required,
    })
    setModal('edit')
  }

  const closeModal = () => {
    setModal(null)
    setEditingItem(null)
    setDraft(emptyDraft())
  }

  const saveModal = async () => {
    if (!draft.title.trim() || !draft.phase_id || !draft.category_id) return
    setSaving(true)
    try {
      if (modal === 'add') {
        await onAddItem(draft)
        closeModal()
      } else if (modal === 'edit' && editingItem) {
        await onUpdateItem(editingItem, {
          title: draft.title.trim(),
          description: draft.description,
          phase_id: draft.phase_id,
          category_id: draft.category_id,
          library_article_id: draft.library_article_id || null,
          required: draft.required,
        })
        closeModal()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRetire = async () => {
    if (!editingItem) return
    await onRetireItem(editingItem)
    closeModal()
  }

  const linkLibraryByTitle = async () => {
    if (!articles.length) {
      toast('Add Library articles first, then link by title', 'error')
      return
    }
    const planned = planLibraryLinksForTemplateItems(items, articles)
    if (planned.length === 0) {
      toast('No unlinked items matched a Library article title', 'error')
      return
    }
    setLinkingLibrary(true)
    try {
      for (const link of planned) {
        const item = items.find((i) => i.id === link.itemId)
        if (!item) continue
        await onUpdateItem(item, { library_article_id: link.articleId })
      }
      toast(`Linked ${planned.length} item${planned.length === 1 ? '' : 's'} to Library articles`, 'success')
    } catch {
      toast('Failed to link some items', 'error')
    } finally {
      setLinkingLibrary(false)
    }
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <Link href="/dashboard/onboarding" style={{ fontSize: '14px', color: muted, textDecoration: 'none' }}>
        ← Onboarding
      </Link>
      <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: '12px 0 4px' }}>
        Onboarding template
      </h1>
      <p style={{ fontSize: '14px', color: muted, margin: '0 0 16px', lineHeight: 1.5 }}>
        Preview what trainees see, then edit items in a panel. Changes sync to active onboardings
        {syncing ? ' (syncing…)' : ''}.
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => onSetTrack(ONBOARDING_TRACK_INTERN)}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: `0.5px solid ${trackId === ONBOARDING_TRACK_INTERN ? brand : border}`,
            background: trackId === ONBOARDING_TRACK_INTERN ? 'var(--status-info-bg)' : cardBg,
            color: trackId === ONBOARDING_TRACK_INTERN ? 'var(--brand-primary-strong)' : muted,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          Staff intern
        </button>
        <button
          type="button"
          onClick={() => onSetTrack(ONBOARDING_TRACK_STUDENT_INTERN)}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: `0.5px solid ${trackId === ONBOARDING_TRACK_STUDENT_INTERN ? brand : border}`,
            background: trackId === ONBOARDING_TRACK_STUDENT_INTERN ? 'var(--status-info-bg)' : cardBg,
            color: trackId === ONBOARDING_TRACK_STUDENT_INTERN ? 'var(--brand-primary-strong)' : muted,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          Student intern
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          marginBottom: '16px',
          fontSize: '13px',
          color: muted,
        }}
      >
        <span style={{ padding: '4px 10px', borderRadius: '999px', background: 'var(--surface-2)', border: `0.5px solid ${border}` }}>
          {phases.length} phases
        </span>
        <span style={{ padding: '4px 10px', borderRadius: '999px', background: 'var(--surface-2)', border: `0.5px solid ${border}` }}>
          {categories.length} categories
        </span>
        <span style={{ padding: '4px 10px', borderRadius: '999px', background: 'var(--surface-2)', border: `0.5px solid ${border}` }}>
          {activeItems.length} items
        </span>
        {trackId === ONBOARDING_TRACK_STUDENT_INTERN && onReapplyStudentTemplate ? (
          <button
            type="button"
            onClick={() => void onReapplyStudentTemplate()}
            disabled={reapplying}
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              background: 'var(--surface-2)',
              border: `0.5px solid ${border}`,
              color: 'var(--link)',
              cursor: reapplying ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
            }}
          >
            {reapplying ? 'Reloading…' : 'Reload default checklist'}
          </button>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '4px',
          padding: '4px',
          borderRadius: '10px',
          background: 'var(--surface-2)',
          border: `0.5px solid ${border}`,
          marginBottom: '20px',
          width: 'fit-content',
        }}
      >
        {tabBtn('checklist', 'Checklist')}
        {tabBtn('structure', 'Phases & categories')}
      </div>

      {tab === 'checklist' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void linkLibraryByTitle()}
              disabled={linkingLibrary || articles.length === 0}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'transparent',
                color: 'var(--link)',
                border: `0.5px solid ${border}`,
                cursor: linkingLibrary || articles.length === 0 ? 'default' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                fontSize: '14px',
                opacity: articles.length === 0 ? 0.5 : 1,
              }}
            >
              {linkingLibrary ? 'Linking…' : 'Link Library by title'}
            </button>
            <button
              type="button"
              onClick={() => openAdd()}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: brand,
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                fontSize: '14px',
              }}
            >
              + Add item
            </button>
          </div>

          {grouped.length === 0 ? (
            <p style={{ fontSize: '14px', color: muted, textAlign: 'center', padding: '32px 16px' }}>
              No phases yet. Add phases and categories under Structure, then add checklist items.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {grouped.map(({ phase, categories: cats }) => {
                const collapsed = collapsedPhases.has(phase.id)
                const phaseItemCount = cats.reduce((n, c) => n + c.items.length, 0)
                return (
                  <section
                    key={phase.id}
                    style={{
                      border: `0.5px solid ${border}`,
                      borderRadius: '12px',
                      overflow: 'hidden',
                      background: cardBg,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => togglePhase(phase.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '12px 16px',
                        background: 'var(--surface-2)',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: '15px', fontWeight: 600, color: text }}>{phase.label}</span>
                      <span style={{ fontSize: '13px', color: muted, flexShrink: 0 }}>
                        {phaseItemCount} {phaseItemCount === 1 ? 'item' : 'items'} {collapsed ? '▸' : '▾'}
                      </span>
                    </button>
                    {!collapsed &&
                      cats.map(({ category, items: catItems }) => (
                        <div key={category.id} style={{ borderTop: `0.5px solid ${border}` }}>
                          <div
                            style={{
                              padding: '8px 16px',
                              fontSize: '11px',
                              fontWeight: 700,
                              letterSpacing: '0.6px',
                              textTransform: 'uppercase',
                              color: muted,
                            }}
                          >
                            {category.label}
                          </div>
                          {catItems.length === 0 ? (
                            <p style={{ fontSize: '13px', color: muted, margin: 0, padding: '8px 16px 12px', fontStyle: 'italic' }}>
                              No items
                            </p>
                          ) : (
                            catItems.map((item, i) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => openEdit(item)}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  justifyContent: 'space-between',
                                  gap: '12px',
                                  padding: '12px 16px',
                                  border: 'none',
                                  borderTop: i > 0 ? `0.5px solid ${border}` : 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  textAlign: 'left',
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 500, color: text }}>{item.title}</p>
                                  {item.description ? (
                                    <p
                                      style={{
                                        margin: '4px 0 0',
                                        fontSize: '13px',
                                        color: muted,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {item.description}
                                    </p>
                                  ) : null}
                                </div>
                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                                  {!item.required && (
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        color: muted,
                                        border: `0.5px solid ${border}`,
                                      }}
                                    >
                                      optional
                                    </span>
                                  )}
                                  {item.library_article_id && (
                                    <span style={{ fontSize: '11px', color: 'var(--brand-primary-strong)' }} title={articleById[item.library_article_id]}>
                                      Library
                                    </span>
                                  )}
                                  <span style={{ fontSize: '13px', color: muted }}>Edit</span>
                                </div>
                              </button>
                            ))
                          )}
                          <button
                            type="button"
                            onClick={() => openAdd(phase.id, category.id)}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '8px 16px 12px',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--link)',
                              fontSize: '13px',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              textAlign: 'left',
                            }}
                          >
                            + Add item here
                          </button>
                        </div>
                      ))}
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'structure' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          <div style={{ border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', background: cardBg }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: text, margin: '0 0 12px' }}>Phases</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {phases.map((p) => (
                <input
                  key={p.id}
                  defaultValue={p.label}
                  onBlur={(e) => {
                    if (e.target.value !== p.label) void onUpdatePhaseLabel(p, e.target.value)
                  }}
                  style={inputStyle}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={newPhase}
                onChange={(e) => setNewPhase(e.target.value)}
                placeholder="New phase"
                style={{ ...inputStyle, flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && void onAddPhase(newPhase).then(() => setNewPhase(''))}
              />
              <button
                type="button"
                onClick={() => void onAddPhase(newPhase).then(() => setNewPhase(''))}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: brand,
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                Add
              </button>
            </div>
          </div>

          <div style={{ border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', background: cardBg }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: text, margin: '0 0 12px' }}>Categories</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {categories.map((c) => (
                <input
                  key={c.id}
                  defaultValue={c.label}
                  onBlur={(e) => {
                    if (e.target.value !== c.label) void onUpdateCategoryLabel(c, e.target.value)
                  }}
                  style={inputStyle}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New category"
                style={{ ...inputStyle, flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && void onAddCategory(newCategory).then(() => setNewCategory(''))}
              />
              <button
                type="button"
                onClick={() => void onAddCategory(newCategory).then(() => setNewCategory(''))}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: brand,
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={closeModal}
        >
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: cardBg,
              border: `0.5px solid ${border}`,
              borderRadius: '16px',
              padding: '20px',
              boxShadow: 'var(--shadow-raised)',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: text, margin: '0 0 16px' }}>
              {modal === 'add' ? 'Add checklist item' : 'Edit item'}
            </h2>
            <label style={{ display: 'block', fontSize: '13px', color: muted, marginBottom: '4px' }}>Title</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              style={{ ...inputStyle, marginBottom: '12px' }}
              autoFocus
            />
            <label style={{ display: 'block', fontSize: '13px', color: muted, marginBottom: '4px' }}>
              Description <span style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={3}
              style={{ ...inputStyle, marginBottom: '12px', resize: 'vertical' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: muted, marginBottom: '4px' }}>Phase</label>
                <select
                  value={draft.phase_id}
                  onChange={(e) => setDraft((d) => ({ ...d, phase_id: e.target.value }))}
                  style={inputStyle}
                >
                  {phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: muted, marginBottom: '4px' }}>Category</label>
                <select
                  value={draft.category_id}
                  onChange={(e) => setDraft((d) => ({ ...d, category_id: e.target.value }))}
                  style={inputStyle}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label style={{ display: 'block', fontSize: '13px', color: muted, marginBottom: '4px' }}>Library article</label>
            <select
              value={draft.library_article_id}
              onChange={(e) => setDraft((d) => ({ ...d, library_article_id: e.target.value }))}
              style={{ ...inputStyle, marginBottom: '12px' }}
            >
              <option value="">None</option>
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                color: text,
                marginBottom: '16px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
              />
              Required for sign-off
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void saveModal()}
                disabled={saving || !draft.title.trim()}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '8px',
                  background: brand,
                  color: '#fff',
                  border: 'none',
                  cursor: saving ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                  opacity: !draft.title.trim() ? 0.5 : 1,
                }}
              >
                {saving ? 'Saving…' : modal === 'add' ? 'Add item' : 'Save'}
              </button>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: `0.5px solid ${border}`,
                  background: 'transparent',
                  color: muted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
            {modal === 'edit' && editingItem && (
              <button
                type="button"
                onClick={() => void handleRetire()}
                style={{
                  marginTop: '12px',
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  border: '0.5px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.06)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                }}
              >
                Remove from track
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
