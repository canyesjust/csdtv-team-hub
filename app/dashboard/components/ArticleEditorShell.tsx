'use client'

/** Placeholder while TipTap chunk loads — keeps compose layout from jumping. */
export default function ArticleEditorShell() {
  return (
    <div
      className="tiptap-editor"
      style={{ minHeight: '280px', padding: '14px 16px', boxSizing: 'border-box' }}
      aria-hidden
    >
      <div
        style={{
          height: '14px',
          width: '72%',
          borderRadius: '6px',
          background: 'var(--surface-3)',
          marginBottom: '10px',
          opacity: 0.5,
        }}
      />
      <div
        style={{
          height: '14px',
          width: '88%',
          borderRadius: '6px',
          background: 'var(--surface-3)',
          marginBottom: '10px',
          opacity: 0.35,
        }}
      />
      <div
        style={{
          height: '14px',
          width: '54%',
          borderRadius: '6px',
          background: 'var(--surface-3)',
          opacity: 0.35,
        }}
      />
    </div>
  )
}
