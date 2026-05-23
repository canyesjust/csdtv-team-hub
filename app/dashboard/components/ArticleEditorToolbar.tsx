'use client'

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

type ArticleEditorToolbarProps = {
  editor: Editor | null
  border: string
  muted: string
  dark: boolean
}

export default function ArticleEditorToolbar({ editor, border, muted, dark }: ArticleEditorToolbarProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!editor) return
    const refresh = () => setTick(t => t + 1)
    editor.on('transaction', refresh)
    editor.on('selectionUpdate', refresh)
    return () => {
      editor.off('transaction', refresh)
      editor.off('selectionUpdate', refresh)
    }
  }, [editor])

  const tbBtn = (label: string, action: () => void, active: boolean, extraStyle?: React.CSSProperties) => (
    <button
      key={label}
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={action}
      disabled={!editor}
      style={{
        fontSize: '13px',
        padding: '4px 10px',
        borderRadius: '6px',
        border: `0.5px solid ${active ? '#1e6cb5' : border}`,
        background: active ? 'rgba(30,108,181,0.15)' : 'transparent',
        color: active ? '#5ba3e0' : muted,
        cursor: editor ? 'pointer' : 'default',
        fontFamily: 'inherit',
        minHeight: '30px',
        opacity: editor ? 1 : 0.5,
        ...extraStyle,
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      style={{
        display: 'flex',
        gap: '4px',
        padding: '8px 10px',
        borderBottom: `0.5px solid ${border}`,
        flexWrap: 'wrap',
        background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
        flexShrink: 0,
      }}
    >
      {tbBtn('B', () => editor?.chain().focus().toggleBold().run(), !!editor?.isActive('bold'), {
        fontWeight: 700,
      })}
      {tbBtn('I', () => editor?.chain().focus().toggleItalic().run(), !!editor?.isActive('italic'), {
        fontStyle: 'italic',
      })}
      {tbBtn('H2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), !!editor?.isActive('heading', { level: 2 }))}
      {tbBtn('H3', () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), !!editor?.isActive('heading', { level: 3 }))}
      {tbBtn('• List', () => editor?.chain().focus().toggleBulletList().run(), !!editor?.isActive('bulletList'))}
      {tbBtn('1. List', () => editor?.chain().focus().toggleOrderedList().run(), !!editor?.isActive('orderedList'))}
      {tbBtn('—', () => editor?.chain().focus().setHorizontalRule().run(), false)}
    </div>
  )
}
