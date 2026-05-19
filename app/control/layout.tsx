import './control-surface.css'

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
    </div>
  )
}
