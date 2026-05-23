'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

const EMPTY_DOC = '<p></p>'

export type ArticleRichEditorProps = {
  /** Pass a changing `key` from the parent when opening a different document (new vs edit). */
  placeholder: string
  onEditorReady?: (editor: Editor | null) => void
  initialContent?: string
}

export default function ArticleRichEditor({
  placeholder,
  onEditorReady,
  initialContent = '',
}: ArticleRichEditorProps) {
  const content = initialContent.trim() ? initialContent : EMPTY_DOC

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder }),
      ],
      content,
      immediatelyRender: false,
      autofocus: false,
      onCreate: ({ editor: ed }) => onEditorReady?.(ed),
      onDestroy: () => onEditorReady?.(null),
    },
    [content, placeholder],
  )

  return <EditorContent editor={editor} className="tiptap-editor" />
}
