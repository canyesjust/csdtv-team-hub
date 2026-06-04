'use client'

import { useMemo, useState } from 'react'
import FilePickButton from '@/components/FilePickButton'
import {
  KB_IMPORT_CSV_TEMPLATE,
  KB_IMPORT_JSON_TEMPLATE,
  parseKbImportPayload,
  type KbImportDuplicateMode,
  type KbImportRow,
} from '@/lib/library/kb-import'
import { downloadTextFile } from '@/lib/library/kb-export'
import { toast } from '@/lib/toast'

type Format = 'csv' | 'json'

type Props = {
  open: boolean
  onClose: () => void
  onImported: () => void
  text: string
  muted: string
  border: string
  cardBg: string
  inputBg: string
}

const inputStyleBase: React.CSSProperties = {
  borderRadius: '10px',
  padding: '10px 14px',
  fontSize: '14px',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

export default function KnowledgeArticlesImportModal({
  open,
  onClose,
  onImported,
  text,
  muted,
  border,
  cardBg,
  inputBg,
}: Props) {
  const [format, setFormat] = useState<Format>('csv')
  const [input, setInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [duplicateMode, setDuplicateMode] = useState<KbImportDuplicateMode>('skip')

  const parsed = useMemo((): KbImportRow[] => {
    if (!input.trim()) return []
    try {
      return parseKbImportPayload(input, format, { normalizeContent: false })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not parse import file'
      const row: KbImportRow = {
        row: 1,
        title: '',
        category: 'Other',
        content: '',
        error: message,
      }
      return [row]
    }
  }, [input, format])
  const validCount = parsed.filter((r) => !r.error).length
  const errorRows = parsed.filter((r) => r.error)

  const inputStyle: React.CSSProperties = {
    ...inputStyleBase,
    background: inputBg,
    border: `0.5px solid ${border}`,
    color: text,
  }

  const close = () => {
    setInput('')
    setFormat('csv')
    setDuplicateMode('skip')
    onClose()
  }

  const loadTemplate = () => {
    if (format === 'json') setInput(KB_IMPORT_JSON_TEMPLATE)
    else setInput(KB_IMPORT_CSV_TEMPLATE)
  }

  const downloadTemplate = () => {
    const ext = format === 'json' ? 'json' : 'csv'
    const content = format === 'json' ? KB_IMPORT_JSON_TEMPLATE : KB_IMPORT_CSV_TEMPLATE
    downloadTextFile(
      `library-import-template.${ext}`,
      content,
      format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
    )
  }

  const handleFile = async (file: File) => {
    const textContent = await file.text()
    const name = file.name.toLowerCase()
    if (name.endsWith('.json')) setFormat('json')
    else setFormat('csv')
    setInput(textContent)
  }

  const runImport = async () => {
    if (!input.trim() || validCount === 0) return
    setImporting(true)
    try {
      const body =
        format === 'json'
          ? { json: input, duplicateMode }
          : { csv: input, duplicateMode }
      const res = await fetch('/api/library/articles/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      let data: {
        error?: string
        created?: number
        updated?: number
        skipped?: number
        errors?: string[]
      } = {}
      const raw = await res.text()
      if (raw) {
        try {
          data = JSON.parse(raw) as typeof data
        } catch {
          toast(res.ok ? 'Import finished but response was invalid' : `Import failed (${res.status})`, 'error')
          return
        }
      }
      if (!res.ok) {
        const detail = data.errors?.length ? `: ${data.errors.slice(0, 2).join('; ')}` : ''
        toast((data.error || 'Import failed') + detail, 'error')
        return
      }
      const created = data.created ?? 0
      const updated = data.updated ?? 0
      const skipped = data.skipped ?? 0

      if (created === 0 && updated === 0 && skipped > 0) {
        toast(
          `No changes — ${skipped} row(s) already exist (titles matched). Choose "Update existing" and import again to refresh content.`,
          'info',
        )
      } else if (created === 0 && updated === 0) {
        toast('Import finished but no articles were created or updated.', 'error')
        return
      } else {
        const parts = [
          created ? `${created} created` : null,
          updated ? `${updated} updated` : null,
          skipped ? `${skipped} skipped` : null,
        ].filter(Boolean)
        toast(parts.join(', '), 'success')
      }
      if (data.errors?.length) {
        console.warn('KB import warnings:', data.errors)
        toast(`Import warnings: ${data.errors.slice(0, 2).join('; ')}`, 'info')
      }
      onImported()
      close()
    } catch (e) {
      console.error('KB import failed', e)
      toast(e instanceof Error ? e.message : 'Import failed', 'error')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        style={{
          background: cardBg,
          border: `0.5px solid ${border}`,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
        }}
      >
        <h2 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 8px', color: text }}>
          Import articles
        </h2>
        <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px', lineHeight: 1.45 }}>
          Bulk-add Library articles from CSV or JSON. CSV columns: <strong>title</strong>,{' '}
          <strong>category</strong> (Process, Reference, Policy, Workflow, Other),{' '}
          <strong>content</strong> (HTML or plain text). JSON can be an array or{' '}
          <code style={{ fontSize: '12px' }}>{'{ "articles": [...] }'}</code>.
        </p>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {(['csv', 'json'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: `0.5px solid ${format === f ? 'var(--brand-primary)' : border}`,
                background: format === f ? 'var(--status-info-bg)' : 'transparent',
                color: format === f ? 'var(--brand-primary-strong)' : muted,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {f.toUpperCase()}
            </button>
          ))}
          <button
            type="button"
            onClick={loadTemplate}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: `0.5px solid ${border}`,
              background: 'transparent',
              color: 'var(--link)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
            }}
          >
            Load example
          </button>
          <button
            type="button"
            onClick={downloadTemplate}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: `0.5px solid ${border}`,
              background: 'transparent',
              color: 'var(--link)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
            }}
          >
            Download template
          </button>
          <FilePickButton
            accept=".csv,.json,text/csv,application/json"
            label="Upload file"
            changeLabel="Change file"
            variant="secondary"
            showFileName={false}
            onChange={file => {
              if (file) void handleFile(file)
            }}
          />
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            format === 'csv'
              ? 'title,category,content\nMy article,Process,"Steps here..."'
              : '[{"title":"My article","category":"Process","content":"<p>Steps here</p>"}]'
          }
          rows={12}
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: '200px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '13px',
          }}
        />

        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '12px', color: muted, margin: '0 0 6px', fontWeight: 500 }}>
            If title already exists
          </p>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                ['skip', 'Skip duplicates'],
                ['update', 'Update existing'],
                ['allow', 'Allow duplicates'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDuplicateMode(mode)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: `0.5px solid ${duplicateMode === mode ? 'var(--brand-primary)' : border}`,
                  background: duplicateMode === mode ? 'var(--status-info-bg)' : 'transparent',
                  color: duplicateMode === mode ? 'var(--brand-primary-strong)' : muted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '12px',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {parsed.length > 0 && (
          <p style={{ fontSize: '13px', color: muted, margin: '10px 0 0' }}>
            {validCount} ready to import
            {errorRows.length > 0 ? ` · ${errorRows.length} with errors` : ''}
          </p>
        )}

        {errorRows.length > 0 && (
          <div
            style={{
              marginTop: '8px',
              maxHeight: '120px',
              overflowY: 'auto',
              border: '0.5px solid rgba(239,68,68,0.25)',
              borderRadius: '8px',
              padding: '8px 10px',
              background: 'rgba(239,68,68,0.04)',
            }}
          >
            <ul style={{ fontSize: '12px', color: '#ef4444', margin: 0, paddingLeft: '18px' }}>
              {errorRows.map((r) => (
                <li key={r.row}>
                  Row {r.row}: {r.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void runImport()}
            disabled={importing || validCount === 0}
            style={{
              flex: 1,
              minHeight: '44px',
              padding: '10px',
              borderRadius: '8px',
              background: '#1e6cb5',
              color: '#fff',
              border: 'none',
              cursor: validCount === 0 ? 'default' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              opacity: validCount === 0 ? 0.5 : 1,
            }}
          >
            {importing ? 'Importing…' : `Import ${validCount || ''} article${validCount === 1 ? '' : 's'}`}
          </button>
          <button
            type="button"
            onClick={close}
            style={{
              minHeight: '44px',
              padding: '10px 16px',
              borderRadius: '8px',
              background: 'transparent',
              color: muted,
              border: `0.5px solid ${border}`,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
