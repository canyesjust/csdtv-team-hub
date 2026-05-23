'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

const EMPTY_DOC = '<p></p>'

export type ArticleRichEditorProps = {
  placeholder: string
  onEditorReady?: (editor: Editor | null) => void
  initialContent?: string
}

export default function ArticleRichEditor({
  placeholder,
  onEditorReady,
  initialContent = '',
}: ArticleRichEditorProps) {
  const onReadyRef = useRef(onEditorReady)
  onReadyRef.current = onEditorReady

  const content = initialContent.trim() ? initialContent : EMPTY_DOC

  const extensions = useMemo(
    () => [StarterKit, Placeholder.configure({ placeholder })],
    [placeholder],
  )

  const editor = useEditor(
    {
      extensions,
      content,
      immediatelyRender: false,
      autofocus: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: 'article-rich-editor__prosemirror',
        },
      },
      onCreate: ({ editor: ed }) => onReadyRef.current?.(ed),
      onDestroy: () => onReadyRef.current?.(null),
    },
    // Parent remounts this component via `key` when switching documents.
    [],
  )

  useEffect(() => {
    return () => onReadyRef.current?.(null)
  }, [])

  return <EditorContent editor={editor} className="tiptap-editor" />
}
