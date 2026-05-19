import './overlay-transparent.css'

export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return <div className="broadcast-overlay-root">{children}</div>
}
