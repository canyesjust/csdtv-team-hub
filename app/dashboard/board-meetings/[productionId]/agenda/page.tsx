import Link from 'next/link'
import BoardMeetingTab from '@/app/dashboard/productions/[id]/components/BoardMeetingTab'

// Dedicated agenda workspace: the agenda import → review → lock flow on its own
// clean page, so operators (and interns) aren't dropped into the busy full
// production-detail page just to work the agenda.
export default async function AgendaWorkspacePage({
  params,
}: {
  params: Promise<{ productionId: string }>
}) {
  const { productionId } = await params
  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
      <Link
        href="/dashboard/board-meetings"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '14px' }}
      >
        ← Board meetings
      </Link>
      <BoardMeetingTab productionId={productionId} />
    </div>
  )
}
