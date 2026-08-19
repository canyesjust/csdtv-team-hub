import type { Metadata } from 'next'
import './gfx.css'
import GfxRootMount from './GfxRootMount'

export const metadata: Metadata = {
  title: 'CSDtv Graphics',
  robots: { index: false, follow: false },
}

export default function GfxLayout({ children }: { children: React.ReactNode }) {
  return <GfxRootMount>{children}</GfxRootMount>
}
