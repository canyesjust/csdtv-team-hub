import './overlay-transparent.css'
import OverlayTransparentMount from './OverlayTransparentMount'

export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <OverlayTransparentMount>
      <div className="broadcast-overlay-root">{children}</div>
    </OverlayTransparentMount>
  )
}
