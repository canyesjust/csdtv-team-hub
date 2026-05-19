export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        overflow: 'auto',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  )
}
