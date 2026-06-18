import './control-surface.css'
import ConfirmHost from '@/app/dashboard/components/ConfirmHost'

export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="control-layout-root"
      style={{
        minHeight: '100dvh',
        height: '100dvh',
        width: '100%',
        background: 'var(--bg-main)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {children}
      {/* Without this, confirmDialog() events in the console/motion screens have
          no listener — the promise never resolves and confirm-gated actions
          (e.g. "Reset / re-do" a motion) silently do nothing. */}
      <ConfirmHost />
    </div>
  )
}
