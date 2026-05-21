'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

type ArticleRichEditorProps = {
  placeholder: string
  onEditorReady?: (editor: Editor | null) => void
  initialContent?: string
}

export default function ArticleRichEditor({
  placeholder,
  onEditorReady,
  initialContent = '',
}: ArticleRichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent,
    immediatelyRender: true,
    onCreate: ({ editor: ed }) => onEditorReady?.(ed),
    onDestroy: () => onEditorReady?.(null),
  })

  return <EditorContent editor={editor} className="tiptap-editor" />
}
